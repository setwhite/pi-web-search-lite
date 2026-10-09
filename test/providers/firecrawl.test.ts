import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../http/index.ts";
import { createFirecrawlProvider } from "../../providers/firecrawl.ts";
import { startTrackedStubServer } from "../stub.ts";

function makeProvider(baseUrl: string) {
	const http = createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" });
	return createFirecrawlProvider({ http, apiKey: "fc-test-key", baseUrl });
}

describe("firecrawl provider", () => {
	it("请求形状：POST /v2/search，Bearer 认证，body 只挑 web 源", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({ success: true, data: { web: [] } }) }));

		await makeProvider(stub.base).search({ query: "pi agent", maxResults: 4 });

		const request = stub.requests[0];
		expect(request.method).toBe("POST");
		expect(request.url).toBe("/v2/search");
		expect(request.headers.authorization).toBe("Bearer fc-test-key");
		expect(request.headers["content-type"]).toBe("application/json");
		expect(JSON.parse(request.body)).toEqual({ query: "pi agent", limit: 4, sources: ["web"] });
	});

	it("响应映射：data.web[].description → snippet，缺 title 用 url，缺 url 丢弃", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({
				success: true,
				data: {
					web: [
						{ title: "  First  ", url: "https://a.test/1", description: "  hello\n  world " },
						{ url: "https://b.test/2" },
						{ title: "no url", description: "dropped" },
					],
				},
			}),
		}));

		const results = await makeProvider(stub.base).search({ query: "q", maxResults: 5 });

		expect(results).toEqual([
			{ title: "First", url: "https://a.test/1", snippet: "hello world" },
			{ title: "https://b.test/2", url: "https://b.test/2", snippet: "" },
		]);
	});

	it("data 缺失或为空时返回空数组", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({ success: true }) }));

		await expect(makeProvider(stub.base).search({ query: "q", maxResults: 5 })).resolves.toEqual([]);
	});

	it("HTTP 200 但 success 为 false 时抛错，带服务端 error 文本", async () => {
		const stub = await startTrackedStubServer(() => ({
			status: 200,
			body: JSON.stringify({ success: false, error: "invalid api key" }),
		}));

		await expect(makeProvider(stub.base).search({ query: "q", maxResults: 5 })).rejects.toThrow(/invalid api key/);
	});
});
