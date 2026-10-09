/**
 * T8 回归：桩 server 走完整链路（tools → provider/extractor → http/ → socket → 桩）。
 * 与 tools 单测的区别是不注入 fakeHttp，改用真实 createHttpClient。
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpClient } from "../../http/index.ts";
import { createSearchProvider } from "../../providers/index.ts";
import { executeFetch } from "../../tools/fetch.ts";
import { executeSearch } from "../../tools/search.ts";
import { startTrackedStubServer } from "../stub.ts";
import { firstText, makeConfig } from "../tools/fixtures.ts";

const UA = "pi-web-search-lite/regression";
const spillDirs: string[] = [];
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
	await Promise.all(closers.splice(0).map((close) => close()));
	for (const dir of spillDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function client(proxy?: string) {
	return createHttpClient({ proxy, timeoutMs: 10_000, userAgent: UA });
}

/** 桩代理：CONNECT 隧道里直接回一页 HTML，用来在 SSRF 允许的域名上跑真实抓取。 */
async function startProxyStub(page: string): Promise<{ base: string; forwarded: string[] }> {
	const forwarded: string[] = [];
	const reply = (): string =>
		`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(page)}\r\n\r\n${page}`;
	const server = createServer((req, res) => {
		forwarded.push(`request ${req.method} ${req.url}`);
		res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
		res.end(page);
	});
	server.on("connect", (req, socket) => {
		forwarded.push(`connect ${req.url}`);
		socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
		socket.once("data", (chunk) => {
			forwarded.push(chunk.toString().split("\r\n")[0] ?? "");
			socket.end(reply());
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	closers.push(
		() =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	);
	return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, forwarded };
}

describe("回归：web_search 全链路", () => {
	it("真实 HTTP 客户端打到桩 Tavily，返回统一信封", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({
				results: [{ title: "Pi 文档", url: "https://example.test/docs", content: "  正文   段落  " }],
			}),
		}));
		const config = makeConfig({ apiKeys: { tavily: "tvly-test" } });
		const provider = createSearchProvider("tavily", { http: client(), apiKey: "tvly-test", baseUrl: stub.base });

		const result = await executeSearch(config, { query: "pi agent" }, undefined, { provider });

		expect(result.details).toMatchObject({
			provider: "tavily",
			query: "pi agent",
			count: 1,
			truncated: false,
			results: [{ title: "Pi 文档", url: "https://example.test/docs", snippet: "正文 段落" }],
		});
		expect(firstText(result)).toContain("Pi 文档");
		const sent = stub.requests[0];
		expect(sent?.method).toBe("POST");
		expect(sent?.url).toBe("/search");
		expect(sent?.headers.authorization).toBe("Bearer tvly-test");
		expect(JSON.parse(sent?.body ?? "{}")).toEqual({ query: "pi agent", max_results: 5 });
	});
});

describe("回归：web_fetch 全链路", () => {
	it("非 GitHub URL 未命中 handler → 经桩代理抓取 → html 提取 → 截断落盘可续读", async () => {
		const body = `正文段落开头${"填充内容".repeat(400)}正文段落结尾`;
		const page = `<html><head><title>桩页面</title></head><body><p>${body}</p></body></html>`;
		const proxy = await startProxyStub(page);
		const config = makeConfig({
			proxy: proxy.base,
			context: { maxInlineChars: 1_200, spillToFile: true },
			fetch: { extractors: ["html"], minChars: 0 },
		});

		const result = await executeFetch(config, { url: "http://example.test/article" }, undefined, {
			http: client(proxy.base),
		});

		expect(proxy.forwarded.join("\n")).toContain("example.test");
		expect(result.details.source).toBe("html");
		expect(result.details.title).toBe("桩页面");
		expect(result.details.truncated).toBe(true);

		const out = result.details.fullOutputPath;
		expect(out).toBeDefined();
		expect(existsSync(out ?? "")).toBe(true);
		spillDirs.push(dirname(out ?? "."));
		const spilled = readFileSync(out ?? "", "utf-8");
		expect(spilled).toContain("正文段落开头");
		expect(spilled).toContain("正文段落结尾");
		expect(spilled).not.toContain("已截断");

		const text = firstText(result);
		expect(text).toContain("[... output truncated:");
		expect(text).toContain(out ?? "");
	});
});
