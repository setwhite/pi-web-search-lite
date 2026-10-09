import { describe, expect, it } from "vitest";
import { createTavilyExtractor } from "../../extractors/tavily.ts";
import type { ExtractorContext } from "../../extractors/types.ts";
import { createHttpClient } from "../../http/index.ts";
import { startTrackedStubServer } from "../stub.ts";

function makeContext(overrides: Partial<ExtractorContext> = {}): ExtractorContext {
	return {
		http: createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" }),
		apiKeys: { tavily: "tvly-key" },
		minChars: 0,
		maxCharsPerPage: 150_000,
		...overrides,
	};
}

describe("tavily extractor", () => {
	it("请求形状：POST /extract，Bearer 认证，body { urls: [url] }", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ results: [{ url: "https://example.com/a", raw_content: "正文" }] }),
		}));

		const page = await createTavilyExtractor(stub.base).extract("https://example.com/a", makeContext());

		const request = stub.requests[0];
		expect(request.method).toBe("POST");
		expect(request.url).toBe("/extract");
		expect(request.headers.authorization).toBe("Bearer tvly-key");
		expect(request.headers["content-type"]).toBe("application/json");
		expect(JSON.parse(request.body)).toEqual({ urls: ["https://example.com/a"] });
		expect(page).toMatchObject({ url: "https://example.com/a", content: "正文" });
	});

	it("failed_results 非空时抛错", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ failed_results: [{ url: "https://example.com/a", error: "无法访问" }] }),
		}));

		await expect(createTavilyExtractor(stub.base).extract("https://example.com/a", makeContext())).rejects.toThrow("无法访问");
	});

	it("没有 raw_content 时抛错", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({ results: [{}] }) }));

		await expect(createTavilyExtractor(stub.base).extract("https://example.com/a", makeContext())).rejects.toThrow(/raw_content/);
	});

	it("缺 key 时 unavailableReason 给出两个配置位置", () => {
		const reason = createTavilyExtractor("http://127.0.0.1:1").unavailableReason(makeContext({ apiKeys: {} }));

		expect(reason).toContain("TAVILY_API_KEY");
		expect(reason).toContain("config.apiKeys.tavily");
	});

	it("有 key 时可用", () => {
		expect(createTavilyExtractor("http://127.0.0.1:1").unavailableReason(makeContext())).toBeNull();
	});
});
