import { describe, expect, it } from "vitest";
import { createFirecrawlExtractor } from "../../extractors/firecrawl.ts";
import type { ExtractorContext } from "../../extractors/types.ts";
import { createHttpClient } from "../../http/index.ts";
import { startTrackedStubServer } from "../stub.ts";

function makeContext(overrides: Partial<ExtractorContext> = {}): ExtractorContext {
	return {
		http: createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" }),
		apiKeys: { firecrawl: "fc-key" },
		minChars: 0,
		maxCharsPerPage: 150_000,
		...overrides,
	};
}

describe("firecrawl extractor", () => {
	it("请求形状：POST /v2/scrape，Bearer 认证，body 要 markdown", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ success: true, data: { markdown: "正文", metadata: { title: "标题", sourceURL: "https://example.com/a" } } }),
		}));

		const page = await createFirecrawlExtractor(stub.base).extract("https://example.com/a", makeContext());

		const request = stub.requests[0];
		expect(request.method).toBe("POST");
		expect(request.url).toBe("/v2/scrape");
		expect(request.headers.authorization).toBe("Bearer fc-key");
		expect(request.headers["content-type"]).toBe("application/json");
		expect(JSON.parse(request.body)).toEqual({ url: "https://example.com/a", formats: ["markdown"] });
		expect(page).toEqual({ url: "https://example.com/a", title: "标题", content: "正文" });
	});

	it("metadata 缺 sourceURL 时沿用入参 url", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ success: true, data: { markdown: "正文", metadata: {} } }),
		}));

		const page = await createFirecrawlExtractor(stub.base).extract("https://example.com/a", makeContext());

		expect(page).toEqual({ url: "https://example.com/a", title: undefined, content: "正文" });
	});

	it("success 为 false 或没有 markdown 时抛错", async () => {
		const failed = await startTrackedStubServer(() => ({ body: JSON.stringify({ success: false, error: "crawl failed" }) }));
		const empty = await startTrackedStubServer(() => ({ body: JSON.stringify({ success: true, data: {} }) }));

		await expect(createFirecrawlExtractor(failed.base).extract("https://example.com/a", makeContext())).rejects.toThrow(/crawl failed|markdown/);
		await expect(createFirecrawlExtractor(empty.base).extract("https://example.com/a", makeContext())).rejects.toThrow(/markdown/);
	});

	it("缺 key 时 unavailableReason 给出两个配置位置", () => {
		const reason = createFirecrawlExtractor("http://127.0.0.1:1").unavailableReason(makeContext({ apiKeys: {} }));

		expect(reason).toContain("FIRECRAWL_API_KEY");
		expect(reason).toContain("config.apiKeys.firecrawl");
	});

	it("有 key 时可用", () => {
		expect(createFirecrawlExtractor("http://127.0.0.1:1").unavailableReason(makeContext())).toBeNull();
	});
});
