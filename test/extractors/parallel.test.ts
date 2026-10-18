import { describe, expect, it } from "vitest";
import { createParallelExtractor } from "../../extractors/parallel.ts";
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
		apiKeys: { parallel: "parallel-key" },
		minChars: 0,
		maxCharsPerPage: 150_000,
		...overrides,
	};
}

describe("parallel extractor", () => {
	it("请求形状：POST /v1/extract，x-api-key 认证，body 要 full_content", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({
				results: [{ url: "https://example.com/a", title: "标题", full_content: "正文" }],
			}),
		}));

		const page = await createParallelExtractor(stub.base).extract(
			"https://example.com/a",
			makeContext(),
		);

		const request = stub.requests[0];
		expect(request.method).toBe("POST");
		expect(request.url).toBe("/v1/extract");
		expect(request.headers["x-api-key"]).toBe("parallel-key");
		expect(request.headers["content-type"]).toBe("application/json");
		expect(JSON.parse(request.body)).toEqual({
			urls: ["https://example.com/a"],
			advanced_settings: { full_content: true },
		});
		expect(page).toMatchObject({ url: "https://example.com/a", title: "标题", content: "正文" });
	});

	it("errors 非空时抛出带 error_type 的错误", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({
				errors: [
					{
						url: "https://example.com/a",
						error_type: "fetch_error",
						http_status_code: 500,
						content: "无法访问",
					},
				],
			}),
		}));

		await expect(
			createParallelExtractor(stub.base).extract("https://example.com/a", makeContext()),
		).rejects.toThrow(/fetch_error/);
	});

	it("没有 full_content 时抛错", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ results: [{ url: "https://example.com/a" }] }),
		}));

		await expect(
			createParallelExtractor(stub.base).extract("https://example.com/a", makeContext()),
		).rejects.toThrow(/full_content/);
	});

	it("缺 key 时 unavailableReason 给出两个配置位置", () => {
		const reason = createParallelExtractor("http://127.0.0.1:1").unavailableReason(
			makeContext({ apiKeys: {} }),
		);

		expect(reason).toContain("PARALLEL_API_KEY");
		expect(reason).toContain("config.apiKeys.parallel");
	});

	it("有 key 时可用", () => {
		expect(
			createParallelExtractor("http://127.0.0.1:1").unavailableReason(makeContext()),
		).toBeNull();
	});
});
