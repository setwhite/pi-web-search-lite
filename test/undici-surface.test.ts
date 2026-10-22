/**
 * 我们依赖的 undici 隐式契约：内部文件路径、代理转发形态、自动解压、错误 cause 形状。
 * 这些都不是 undici 的公开承诺，但仓库的关键路径压在上面，升级 undici 时先看这里红没红。
 * 升级流程见 `docs/modules/http.md` 的「依赖升级」。
 */
import { createServer, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { gzipSync } from "node:zlib";
import { badPortsSet } from "undici/lib/web/fetch/constants.js";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpClient, HttpError } from "../http/index.ts";
import { listenEphemeral } from "./stub.ts";

const UA = "pi-web-search-lite/test";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	await Promise.all(cleanups.splice(0).map((close) => close()));
});

function makeClient(options: { proxy?: string; timeoutMs?: number } = {}) {
	return createHttpClient({
		proxy: options.proxy,
		timeoutMs: options.timeoutMs ?? 5_000,
		userAgent: UA,
	});
}

function trackServer(server: ReturnType<typeof createServer>): void {
	cleanups.push(
		() =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	);
}

describe("undici 表面契约", () => {
	it("badPortsSet 仍从同一个内部路径导出（test/stub.ts 深 import 的锚点）", () => {
		// 名单内容随 fetch 规范变，这里只断言「路径 + 导出名 + 形状」没变
		expect(badPortsSet).toBeInstanceOf(Set);
		expect(badPortsSet.size).toBeGreaterThan(60);
		expect(badPortsSet.has("6566")).toBe(true); // 本机动态端口段重叠的那一段
	});

	it("http 目标经 ProxyAgent 走 absolute-form，不建 CONNECT 隧道", async () => {
		const seen: string[] = [];
		let connectAttempts = 0;
		const server = createServer((req, res) => {
			seen.push(`${req.method} ${req.url}`);
			res.writeHead(200, { "content-type": "text/plain" });
			res.end("via-proxy");
		});
		server.on("connect", (_req: IncomingMessage, socket: Duplex) => {
			connectAttempts += 1;
			socket.destroy();
		});
		const port = await listenEphemeral(server);
		trackServer(server);

		const result = await makeClient({ proxy: `http://127.0.0.1:${port}` }).fetchText(
			"http://example.test/probe",
		);

		// example.test 本地解析不到，成功即证明经代理；请求行是完整 URL 而不是 CONNECT
		expect(result.text).toBe("via-proxy");
		expect(seen).toEqual(["GET http://example.test/probe"]);
		expect(connectAttempts).toBe(0);
	});

	it("压缩响应在 response.text() 前自动解压", async () => {
		const payload = JSON.stringify({ hello: "世界" });
		const server = createServer((_req, res) => {
			res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
			res.end(gzipSync(payload));
		});
		const port = await listenEphemeral(server);
		trackServer(server);

		const result = await makeClient().fetchJson<{ hello: string }>(`http://127.0.0.1:${port}/gzip`);

		expect(result.data).toEqual({ hello: "世界" });
	});

	it("网络错误的 cause 链里带得住底层 code（describeCause 的输入形状）", async () => {
		// 先 bind 再 close：拿到一个确定没有监听者的端口（listenEphemeral 保证它不在 bad port 名单里）
		const probe = createServer();
		const port = await listenEphemeral(probe);
		await new Promise<void>((resolve) => probe.close(() => resolve()));

		const error = await makeClient({ timeoutMs: 2_000 })
			.fetchText(`http://127.0.0.1:${port}/dead`)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(HttpError);
		expect((error as HttpError).type).toBe("network");
		// 契约：不照抄 undici 外层的 "fetch failed"，要带 code 与地址
		expect((error as HttpError).message).toContain("ECONNREFUSED");
		expect((error as HttpError).message).toContain(`127.0.0.1:${port}`);
	});
});
