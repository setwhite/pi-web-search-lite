import { describe, expect, it } from "vitest";
import { createKeenableExtractor } from "../../extractors/keenable.ts";
import type { ExtractorContext } from "../../extractors/types.ts";
import { createHttpClient } from "../../http/index.ts";
import { startTrackedStubServer } from "../stub.ts";

function makeContext(overrides: Partial<ExtractorContext> = {}): ExtractorContext {
	return {
		http: createHttpClient({
			proxy: undefined,
			timeoutMs: 5_000,
			userAgent: "pi-web-search-lite/test",
		}),
		apiKeys: { keenable: "keen-key" },
		minChars: 0,
		maxCharsPerPage: 150_000,
		...overrides,
	};
}

describe("keenable extractor", () => {
	it("请求形状：GET /v1/fetch?url=&live=true，x-api-key 认证", async () => {
		const target = "https://example.com/a?b=1";
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ url: target, title: "标题", content: "# 正文" }),
		}));

		const page = await createKeenableExtractor(stub.base).extract(target, makeContext());

		const request = stub.requests[0];
		expect(request.method).toBe("GET");
		// live=true：默认只给索引副本（未索引的 URL 报错），提取器要的是源站最新正文
		expect(request.url).toBe(`/v1/fetch?url=${encodeURIComponent(target)}&live=true`);
		expect(request.headers["x-api-key"]).toBe("keen-key");
		expect(page).toMatchObject({ url: target, title: "标题", content: "# 正文" });
	});

	it("没有 content 时抛错", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ url: "https://example.com/a" }),
		}));

		await expect(
			createKeenableExtractor(stub.base).extract("https://example.com/a", makeContext()),
		).rejects.toThrow(/content/);
	});

	it("缺 key 时 unavailableReason 给出两个配置位置", () => {
		const reason = createKeenableExtractor("http://127.0.0.1:1").unavailableReason(
			makeContext({ apiKeys: {} }),
		);

		expect(reason).toContain("KEENABLE_API_KEY");
		expect(reason).toContain("config.apiKeys.keenable");
	});

	it("有 key 时可用", () => {
		expect(
			createKeenableExtractor("http://127.0.0.1:1").unavailableReason(makeContext()),
		).toBeNull();
	});
});
