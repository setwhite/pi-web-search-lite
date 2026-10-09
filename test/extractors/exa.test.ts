import { describe, expect, it } from "vitest";
import { createExaExtractor } from "../../extractors/exa.ts";
import type { ExtractorContext } from "../../extractors/types.ts";
import { createHttpClient } from "../../http/index.ts";
import { startTrackedStubServer } from "../stub.ts";

function makeContext(overrides: Partial<ExtractorContext> = {}): ExtractorContext {
	return {
		http: createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" }),
		apiKeys: { exa: "exa-key" },
		minChars: 0,
		maxCharsPerPage: 1_234,
		...overrides,
	};
}

describe("exa extractor", () => {
	it("请求形状：POST /contents，x-api-key，body { ids, text.maxCharacters }", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({ results: [{ url: "https://example.com/a", title: "标题", text: "正文" }] }),
		}));

		const page = await createExaExtractor(stub.base).extract("https://example.com/a", makeContext());

		const request = stub.requests[0];
		expect(request.method).toBe("POST");
		expect(request.url).toBe("/contents");
		expect(request.headers["x-api-key"]).toBe("exa-key");
		expect(request.headers["content-type"]).toBe("application/json");
		expect(JSON.parse(request.body)).toEqual({
			ids: ["https://example.com/a"],
			text: { maxCharacters: 1_234 },
		});
		expect(page).toMatchObject({ url: "https://example.com/a", title: "标题", content: "正文" });
	});

	it("没有 text 时抛错", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({ results: [{ url: "https://example.com/a" }] }) }));

		await expect(createExaExtractor(stub.base).extract("https://example.com/a", makeContext())).rejects.toThrow(/text/);
	});

	it("缺 key 时 unavailableReason 给出两个配置位置", () => {
		const reason = createExaExtractor("http://127.0.0.1:1").unavailableReason(makeContext({ apiKeys: {} }));

		expect(reason).toContain("EXA_API_KEY");
		expect(reason).toContain("config.apiKeys.exa");
	});

	it("有 key 时可用", () => {
		expect(createExaExtractor("http://127.0.0.1:1").unavailableReason(makeContext())).toBeNull();
	});
});
