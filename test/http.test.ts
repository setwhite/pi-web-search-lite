import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpClient, HttpError } from "../http/index.ts";
import { SsrfError } from "../ssrf/index.ts";

const UA = "pi-web-search-lite/test";

type Stub = {
	base: string;
	requests: IncomingMessage[];
	readonly hits: number;
	close: () => Promise<void>;
};

async function startStub(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<Stub> {
	const requests: IncomingMessage[] = [];
	const server = createServer((req, res) => {
		requests.push(req);
		handler(req, res);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return {
		base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
		requests,
		get hits() {
			return requests.length;
		},
		close: () =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	};
}

/** 永不响应的桩 server，用于超时 / 中断用例。 */
async function startHangingStub(): Promise<Stub> {
	return startStub(() => {
		/* 不响应 */
	});
}

function makeClient(options: { proxy?: string; timeoutMs?: number } = {}) {
	return createHttpClient({ proxy: options.proxy, timeoutMs: options.timeoutMs ?? 5_000, userAgent: UA });
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	await Promise.all(cleanups.splice(0).map((fn) => fn()));
});

function track<T extends { close: () => Promise<void> }>(stub: T): T {
	cleanups.push(stub.close);
	return stub;
}

describe("http：请求形状与响应", () => {
	it("直连请求带配置的 userAgent，返回 status / contentType / text", async () => {
		const stub = track(
			await startStub((_req, res) => {
				res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
				res.end("hello");
			}),
		);

		const result = await makeClient().fetchText(`${stub.base}/page`);

		expect(result.status).toBe(200);
		expect(result.url).toBe(stub.base + "/page");
		expect(result.contentType).toBe("text/plain; charset=utf-8");
		expect(result.text).toBe("hello");
		expect(stub.requests[0]?.headers["user-agent"]).toBe(UA);
	});

	it("fetchJson 解析 JSON，POST 的 method / headers / body 原样送达", async () => {
		const stub = track(
			await startStub((req, res) => {
				let body = "";
				req.on("data", (chunk) => {
					body += chunk;
				});
				req.on("end", () => {
					res.writeHead(200, { "content-type": "application/json" });
					res.end(JSON.stringify({ method: req.method, contentType: req.headers["content-type"], body }));
				});
			}),
		);

		const result = await makeClient().fetchJson<{ method: string; contentType: string; body: string }>(`${stub.base}/echo`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ q: "hi" }),
		});

		expect(result.data).toEqual({ method: "POST", contentType: "application/json", body: '{"q":"hi"}' });
	});

	it("非 2xx 抛 http_status，错误含状态码、URL 与响应体", async () => {
		const stub = track(
			await startStub((_req, res) => {
				res.writeHead(404, { "content-type": "text/plain" });
				res.end("missing");
			}),
		);

		const error = await makeClient()
			.fetchText(`${stub.base}/nope`)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(HttpError);
		expect((error as HttpError).type).toBe("http_status");
		expect((error as HttpError).status).toBe(404);
		expect((error as HttpError).url).toBe(stub.base + "/nope");
		expect((error as HttpError).message).toContain("404");
		expect((error as HttpError).message).toContain(stub.base + "/nope");
		expect((error as HttpError).body).toContain("missing");
	});

	it("200 但响应不是合法 JSON 时抛 parse", async () => {
		const stub = track(
			await startStub((_req, res) => {
				res.end("not json");
			}),
		);

		const error = await makeClient()
			.fetchJson(`${stub.base}/bad`)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(HttpError);
		expect((error as HttpError).type).toBe("parse");
	});
});

describe("http：超时与中断", () => {
	it("timeoutMs 到期抛归一化 timeout 错误", async () => {
		const stub = track(await startHangingStub());

		const error = await makeClient({ timeoutMs: 100 })
			.fetchText(`${stub.base}/slow`)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(HttpError);
		expect((error as HttpError).type).toBe("timeout");
		expect((error as HttpError).message).toContain(`${stub.base}/slow`);
	});

	it("调用方 AbortSignal 中断抛归一化 abort 错误", async () => {
		const stub = track(await startHangingStub());
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 30);

		const error = await makeClient()
			.fetchText(`${stub.base}/slow`, { signal: controller.signal })
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(HttpError);
		expect((error as HttpError).type).toBe("abort");
	});
});

describe("http：代理", () => {
	/** 桩代理：同时兼容 CONNECT 隧道与绝对形式请求两种转发形态。 */
	async function startProxyStub(): Promise<Stub & { forwarded: string[] }> {
		const forwarded: string[] = [];
		const server = createServer((req, res) => {
			forwarded.push(`request ${req.method} ${req.url}`);
			res.writeHead(200, { "content-type": "text/plain" });
			res.end("via-proxy");
		});
		server.on("connect", (req, socket) => {
			forwarded.push(`connect ${req.url}`);
			socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
			socket.once("data", (chunk) => {
				forwarded.push(chunk.toString().split("\r\n")[0] ?? "");
				socket.end("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 9\r\n\r\nvia-proxy");
			});
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		return {
			base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
			requests: [],
			forwarded,
			get hits() {
				return forwarded.length;
			},
			close: () =>
				new Promise<void>((resolve) => {
					server.closeAllConnections();
					server.close(() => resolve());
				}),
		};
	}

	it("配置 proxy 后非本机目标经桩代理（example.test 本地无法解析，成功即证明未直连）", async () => {
		const proxy = track(await startProxyStub());

		const result = await makeClient({ proxy: proxy.base }).fetchText("http://example.test/probe");

		expect(result.text).toBe("via-proxy");
		expect(proxy.hits).toBeGreaterThan(0);
		expect(proxy.forwarded.join("\n")).toContain("example.test");
	});

	it("配置 proxy 时 localhost / 127.0.0.1 目标仍直连", async () => {
		const proxy = track(await startProxyStub());
		const target = track(
			await startStub((_req, res) => {
				res.end("direct");
			}),
		);

		const result = await makeClient({ proxy: proxy.base }).fetchText(`${target.base}/local`);

		expect(result.text).toBe("direct");
		expect(proxy.hits).toBe(0);
		expect(target.hits).toBe(1);
	});
});

describe("http：重定向守卫", () => {
	it("拒绝 30x 跳到非 http(s) 目标（抛 SsrfError）", async () => {
		const stub = track(
			await startStub((_req, res) => {
				res.writeHead(302, { location: "file:///etc/passwd" });
				res.end();
			}),
		);

		const error = await makeClient()
			.fetchText(`${stub.base}/jump`)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(SsrfError);
		expect((error as SsrfError).type).toBe("blocked_protocol");
	});

	it("相对 Location 解析后指向本机私有地址同样拒绝", async () => {
		const stub = track(
			await startStub((_req, res) => {
				res.writeHead(301, { location: "/next" });
				res.end();
			}),
		);

		const error = await makeClient()
			.fetchText(`${stub.base}/jump`)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(SsrfError);
		expect((error as SsrfError).type).toBe("blocked_ip");
	});
});
