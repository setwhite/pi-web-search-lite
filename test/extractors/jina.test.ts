import { describe, expect, it } from "vitest";
import { createJinaExtractor } from "../../extractors/jina.ts";
import type { ExtractorContext } from "../../extractors/types.ts";
import { createHttpClient } from "../../http/index.ts";
import { startTrackedStubServer } from "../stub.ts";

function makeContext(overrides: Partial<ExtractorContext> = {}): ExtractorContext {
	return {
		http: createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" }),
		apiKeys: {},
		minChars: 0,
		maxCharsPerPage: 150_000,
		...overrides,
	};
}

describe("jina extractor", () => {
	it("请求形状：GET /<目标 url>，Accept 要 JSON，无 key 时不带认证头", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ code: 200, status: 20_000, data: { url: "https://example.com/a", title: "标题", content: "正文" } }),
		}));

		const page = await createJinaExtractor(stub.base).extract("https://example.com/a", makeContext());

		const request = stub.requests[0];
		expect(request.method).toBe("GET");
		expect(request.url).toBe("/https://example.com/a");
		expect(request.headers.accept).toBe("application/json");
		expect(request.headers.authorization).toBeUndefined();
		expect(page).toEqual({ url: "https://example.com/a", title: "标题", content: "正文" });
	});

	it("有 key 时带上 Bearer 认证（付费档更高配额）", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ code: 200, status: 20_000, data: { url: "https://example.com/a", title: "标题", content: "正文" } }),
		}));

		await createJinaExtractor(stub.base).extract("https://example.com/a", makeContext({ apiKeys: { jina: "jina-key" } }));

		expect(stub.requests[0].headers.authorization).toBe("Bearer jina-key");
	});

	it("data 缺 url 时沿用入参 url", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({ code: 200, data: { content: "正文" } }) }));

		const page = await createJinaExtractor(stub.base).extract("https://example.com/a", makeContext());

		expect(page).toEqual({ url: "https://example.com/a", title: undefined, content: "正文" });
	});

	it("code 非 200 或没有 content 时抛错", async () => {
		const failed = await startTrackedStubServer(() => ({ body: JSON.stringify({ code: 451, message: "blocked by site" }) }));
		const empty = await startTrackedStubServer(() => ({ body: JSON.stringify({ code: 200, data: {} }) }));

		await expect(createJinaExtractor(failed.base).extract("https://example.com/a", makeContext())).rejects.toThrow(/451|blocked/);
		await expect(createJinaExtractor(empty.base).extract("https://example.com/a", makeContext())).rejects.toThrow(/content/);
	});

	it("无 key 也可用：unavailableReason 恒为 null", () => {
		expect(createJinaExtractor("http://127.0.0.1:1").unavailableReason(makeContext())).toBeNull();
	});
});
