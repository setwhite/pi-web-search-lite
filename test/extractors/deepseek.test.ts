import { describe, expect, it } from "vitest";
import { createDeepSeekExtractor } from "../../extractors/deepseek.ts";
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
		apiKeys: { deepseek: "sk-deepseek" },
		minChars: 0,
		maxCharsPerPage: 150_000,
		...overrides,
	};
}

describe("deepseek extractor", () => {
	it("请求形状：POST /v1/tools/fetch，Bearer 认证，body 为 { url }", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ title: "标题", content: "# 正文" }),
		}));

		const page = await createDeepSeekExtractor(stub.base).extract(
			"https://example.com/a",
			makeContext(),
		);

		const request = stub.requests[0];
		expect(request.method).toBe("POST");
		expect(request.url).toBe("/v1/tools/fetch");
		expect(request.headers.authorization).toBe("Bearer sk-deepseek");
		expect(request.headers["content-type"]).toBe("application/json");
		expect(JSON.parse(request.body)).toEqual({ url: "https://example.com/a" });
		expect(page).toMatchObject({ url: "https://example.com/a", title: "标题", content: "# 正文" });
	});

	it("没有 content 时抛错", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ title: "只有标题" }),
		}));

		await expect(
			createDeepSeekExtractor(stub.base).extract("https://example.com/a", makeContext()),
		).rejects.toThrow(/content/);
	});

	it("缺 key 时 unavailableReason 给出两个配置位置", () => {
		const reason = createDeepSeekExtractor("http://127.0.0.1:1").unavailableReason(
			makeContext({ apiKeys: {} }),
		);

		expect(reason).toContain("DEEPSEEK_API_KEY");
		expect(reason).toContain("config.apiKeys.deepseek");
	});

	it("有 key 时可用", () => {
		expect(
			createDeepSeekExtractor("http://127.0.0.1:1").unavailableReason(makeContext()),
		).toBeNull();
	});
});
