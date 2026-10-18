import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../http/index.ts";
import { createDeepSeekProvider } from "../../providers/deepseek.ts";
import { startTrackedStubServer } from "../stub.ts";

function makeProvider(baseUrl: string) {
	const http = createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" });
	return createDeepSeekProvider({ http, apiKey: "sk-deepseek-test", baseUrl });
}

describe("deepseek provider", () => {
	it("请求形状：POST /v1/tools/search，Bearer 认证，body 为 { query, count }", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({ results: [] }) }));

		await makeProvider(stub.base).search({ query: "pi agent", maxResults: 3 });

		const request = stub.requests[0];
		expect(request.method).toBe("POST");
		expect(request.url).toBe("/v1/tools/search");
		expect(request.headers.authorization).toBe("Bearer sk-deepseek-test");
		expect(request.headers["content-type"]).toBe("application/json");
		expect(JSON.parse(request.body)).toEqual({ query: "pi agent", count: 3 });
	});

	it("响应映射：summary 优先于 snippet，缺 title 用 url，缺 url 丢弃", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({
				results: [
					{ title: "  First  ", url: "https://a.test/1", summary: "  long summary ", snippet: "short" },
					{ title: "Second", url: "https://b.test/2", snippet: "only snippet" },
					{ title: "no url", summary: "dropped" },
				],
			}),
		}));

		const results = await makeProvider(stub.base).search({ query: "q", maxResults: 5 });

		expect(results).toEqual([
			{ title: "First", url: "https://a.test/1", snippet: "long summary" },
			{ title: "Second", url: "https://b.test/2", snippet: "only snippet" },
		]);
	});

	it("results 缺失时返回空数组", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({}) }));

		await expect(makeProvider(stub.base).search({ query: "q", maxResults: 5 })).resolves.toEqual([]);
	});
});
