import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { badPortsSet } from "undici/lib/web/fetch/constants.js";
import { afterEach } from "vitest";

export interface StubRequest {
	method: string;
	url: string;
	headers: IncomingMessage["headers"];
	body: string;
}

export interface StubReply {
	status?: number;
	contentType?: string;
	body: string;
}

export interface StubServer {
	base: string;
	requests: StubRequest[];
	close: () => Promise<void>;
}

/** 起临时端口所需的最小 server 面（真 `Server` 与测试里的假 server 都满足）。 */
export interface ListenableServer {
	listen(port: number, host: string, onListening: () => void): unknown;
	address: () => AddressInfo | string | null;
	close(onClose?: (error?: Error) => void): unknown;
}

const LISTEN_ATTEMPTS = 10;

/**
 * 绑定 127.0.0.1 的临时端口并返回端口号。
 *
 * 不用裸 `listen(0)`：内核的动态端口段（本机 1024–15000，见 `netsh int ipv4 show dynamicport tcp`）与 undici 的
 * bad port 名单（82 个端口，全部 ≤ 10080）重叠，抽到名单里的端口时 fetch 会先判 `bad port` 直接拒发，
 * 桩 server 一次都不被访问，用例随机红（实测抽到过 6566）；抽到就关掉重抽。
 */
export async function listenEphemeral(server: ListenableServer): Promise<number> {
	for (let attempt = 0; attempt < LISTEN_ATTEMPTS; attempt += 1) {
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		const port = typeof address === "object" && address !== null ? address.port : Number(address);
		if (!badPortsSet.has(String(port))) return port;
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
	throw new Error(`连续 ${LISTEN_ATTEMPTS} 次抽到 undici 拒发的端口，检查本机动态端口范围`);
}

/** 本地桩 server：记录请求的方法 / 路径 / 头 / 体，返回 handler 给定的响应。 */
export async function startStubServer(
	handler: (request: StubRequest) => StubReply,
): Promise<StubServer> {
	const requests: StubRequest[] = [];
	const server = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			const request: StubRequest = {
				method: req.method ?? "",
				url: req.url ?? "",
				headers: req.headers,
				body: Buffer.concat(chunks).toString("utf-8"),
			};
			requests.push(request);
			const reply = handler(request);
			res.writeHead(reply.status ?? 200, {
				"content-type": reply.contentType ?? "application/json",
			});
			res.end(reply.body);
		});
	});
	const port = await listenEphemeral(server);
	return {
		base: `http://127.0.0.1:${port}`,
		requests,
		close: () =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	};
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	await Promise.all(cleanups.splice(0).map((close) => close()));
});

/** `startStubServer` + 测试结束自动关闭。 */
export async function startTrackedStubServer(
	handler: (request: StubRequest) => StubReply,
): Promise<StubServer> {
	const stub = await startStubServer(handler);
	cleanups.push(stub.close);
	return stub;
}
