import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../http/index.ts";
import { createBraveProvider } from "../../providers/brave.ts";
import { startTrackedStubServer } from "../stub.ts";

function makeProvider(baseUrl: string) {
	const http = createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" });
	return createBraveProvider({ http, apiKey: "brave-test-key", baseUrl });
}

describe("brave provider", () => {
	it("请求形状：GET /web/search，X-Subscription-Token，query 参数 q / count", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({ web: { results: [] } }) }));

		await makeProvider(stub.base).search({ query: "pi agent", maxResults: 5 });

		const request = stub.requests[0];
		expect(request.method).toBe("GET");
		const url = new URL(request.url, "http://stub");
		expect(url.pathname).toBe("/web/search");
		expect(url.searchParams.get("q")).toBe("pi agent");
		expect(url.searchParams.get("count")).toBe("5");
		expect(request.headers["x-subscription-token"]).toBe("brave-test-key");
		expect(request.headers.accept).toBe("application/json");
	});

	it("响应映射：description → snippet，缺 title 用 url，缺 url 丢弃", async () => {
		const stub = await startTrackedStubServer(() => ({
			body: JSON.stringify({
				web: {
					results: [
						{ title: "  First  ", url: "https://a.test/1", description: "  hello\n  world " },
						{ url: "https://b.test/2" },
						{ title: "no url" },
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

	it("web.results 缺失时返回空数组", async () => {
		const stub = await startTrackedStubServer(() => ({ body: JSON.stringify({}) }));

		await expect(makeProvider(stub.base).search({ query: "q", maxResults: 5 })).resolves.toEqual([]);
	});
});
