import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../http/index.ts";
import { createKeenableProvider } from "../../providers/keenable.ts";
import { startTrackedStubServer } from "../stub.ts";

function makeProvider(baseUrl: string) {
	const http = createHttpClient({
		proxy: undefined,
		timeoutMs: 5_000,
		userAgent: "pi-web-search-lite/test",
	});
	return createKeenableProvider({ http, apiKey: "keen-test-key", baseUrl });
}

describe("keenable provider", () => {
	it("请求形状：POST /v1/search，x-api-key 认证，body 为 { query, max_results }", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({ results: [] }) }));

		await makeProvider(stub.base).search({ query: "pi agent", maxResults: 3 });

		const request = stub.requests[0];
		expect(request.method).toBe("POST");
		expect(request.url).toBe("/v1/search");
		expect(request.headers["x-api-key"]).toBe("keen-test-key");
		expect(request.headers["content-type"]).toBe("application/json");
		expect(JSON.parse(request.body)).toEqual({ query: "pi agent", max_results: 3 });
	});

	it("响应映射：snippet 优先于 description，缺 title 用 url，缺 url 丢弃", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({
				results: [
					{
						title: "  First  ",
						url: "https://a.test/1",
						snippet: "  long\n\n excerpt ",
						description: "short",
					},
					{ title: "Second", url: "https://b.test/2", description: "only description" },
					{ title: "no url", snippet: "dropped" },
				],
			}),
		}));

		const results = await makeProvider(stub.base).search({ query: "q", maxResults: 5 });

		expect(results).toEqual([
			{ title: "First", url: "https://a.test/1", snippet: "long excerpt" },
			{ title: "Second", url: "https://b.test/2", snippet: "only description" },
		]);
	});

	it("results 缺失时返回空数组", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({}) }));

		await expect(makeProvider(stub.base).search({ query: "q", maxResults: 5 })).resolves.toEqual(
			[],
		);
	});
});
