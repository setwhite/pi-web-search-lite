import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../http/index.ts";
import { createExaProvider } from "../../providers/exa.ts";
import { startTrackedStubServer } from "../stub.ts";

function makeProvider(baseUrl: string) {
	const http = createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" });
	return createExaProvider({ http, apiKey: "exa-test-key", baseUrl });
}

describe("exa provider", () => {
	it("请求形状：POST /search，x-api-key，body 请求正文片段", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({ results: [] }) }));

		await makeProvider(stub.base).search({ query: "pi agent", maxResults: 4 });

		const request = stub.requests[0];
		expect(request.method).toBe("POST");
		expect(request.url).toBe("/search");
		expect(request.headers["x-api-key"]).toBe("exa-test-key");
		expect(request.headers["content-type"]).toBe("application/json");
		expect(JSON.parse(request.body)).toEqual({
			query: "pi agent",
			numResults: 4,
			contents: { text: { maxCharacters: 300 } },
		});
	});

	it("响应映射：text → snippet，缺 title 用 url，缺 url 丢弃", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({
				results: [
					{ title: "  First  ", url: "https://a.test/1", text: "  hello\n  world " },
					{ url: "https://b.test/2" },
					{ title: "no url", text: "dropped" },
				],
			}),
		}));

		const results = await makeProvider(stub.base).search({ query: "q", maxResults: 5 });

		expect(results).toEqual([
			{ title: "First", url: "https://a.test/1", snippet: "hello world" },
			{ title: "https://b.test/2", url: "https://b.test/2", snippet: "" },
		]);
	});

	it("results 缺失时返回空数组", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({}) }));

		await expect(makeProvider(stub.base).search({ query: "q", maxResults: 5 })).resolves.toEqual([]);
	});
});
