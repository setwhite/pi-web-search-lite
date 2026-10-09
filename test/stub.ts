import { createServer, type IncomingMessage } from "node:http";
import { type AddressInfo } from "node:net";
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

/** 本地桩 server：记录请求的方法 / 路径 / 头 / 体，返回 handler 给定的响应。 */
export async function startStubServer(handler: (request: StubRequest) => StubReply): Promise<StubServer> {
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
			res.writeHead(reply.status ?? 200, { "content-type": reply.contentType ?? "application/json" });
			res.end(reply.body);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return {
		base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
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
export async function startTrackedStubServer(handler: (request: StubRequest) => StubReply): Promise<StubServer> {
	const stub = await startStubServer(handler);
	cleanups.push(stub.close);
	return stub;
}
