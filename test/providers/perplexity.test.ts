import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../http/index.ts";
import { createPerplexityProvider } from "../../providers/perplexity.ts";
import { startTrackedStubServer } from "../stub.ts";

function makeProvider(baseUrl: string) {
	const http = createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" });
	return createPerplexityProvider({ http, apiKey: "pplx-test-key", baseUrl });
}

describe("perplexity provider", () => {
	it("请求形状：POST /search，Bearer 认证，body 只带 query 与 max_results", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({ results: [] }) }));

		await makeProvider(stub.base).search({ query: "pi agent", maxResults: 3 });

		const request = stub.requests[0];
		expect(request.method).toBe("POST");
		expect(request.url).toBe("/search");
		expect(request.headers.authorization).toBe("Bearer pplx-test-key");
		expect(request.headers["content-type"]).toBe("application/json");
		expect(JSON.parse(request.body)).toEqual({ query: "pi agent", max_results: 3 });
	});

	it("响应映射：snippet 原样折叠，缺 title 用 url，缺 url 丢弃", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({
				results: [
					{ title: " First ", url: "https://a.test/1", snippet: " one\n two ", date: "2026-01-01" },
					{ url: "https://b.test/2" },
					{ title: "no url", snippet: "dropped" },
				],
			}),
		}));

		const results = await makeProvider(stub.base).search({ query: "q", maxResults: 5 });

		expect(results).toEqual([
			{ title: "First", url: "https://a.test/1", snippet: "one two" },
			{ title: "https://b.test/2", url: "https://b.test/2", snippet: "" },
		]);
	});

	it("results 缺失时返回空数组", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({}) }));

		await expect(makeProvider(stub.base).search({ query: "q", maxResults: 5 })).resolves.toEqual([]);
	});
});
