import { describe, expect, it } from "vitest";
import type { ProviderId } from "../../config/index.ts";
import type { SearchOptions, SearchProvider, SearchResult } from "../../providers/index.ts";
import { createSearchTool, executeSearch } from "../../tools/search.ts";
import { firstText, makeConfig, rejectionOf } from "./fixtures.ts";

const RESULTS: SearchResult[] = [
	{ title: "示例结果", url: "https://example.com/a", snippet: "这是摘要" },
	{ title: "第二条", url: "https://example.com/b", snippet: "" },
];

function fakeProvider(id: ProviderId, results: SearchResult[] = []) {
	const seen: SearchOptions[] = [];
	const provider: SearchProvider = {
		id,
		async search(options) {
			seen.push(options);
			return results;
		},
	};
	return { provider, seen };
}

const config = makeConfig({ apiKeys: { tavily: "tvly-key" }, search: { defaultMaxResults: 5, maxResultsLimit: 10 } });

describe("executeSearch", () => {
	it("max_results 超上限时 clamp 到 maxResultsLimit，未传时用 defaultMaxResults", async () => {
		const capped = fakeProvider("tavily");
		await executeSearch(config, { query: "q", max_results: 999 }, undefined, { provider: capped.provider });

		const fallback = fakeProvider("tavily");
		await executeSearch(config, { query: "q" }, undefined, { provider: fallback.provider });

		expect(capped.seen[0]?.maxResults).toBe(10);
		expect(fallback.seen[0]?.maxResults).toBe(5);
	});

	it("信封含 provider、标题、URL 与摘要，details 结构化", async () => {
		const { provider } = fakeProvider("tavily", RESULTS);

		const result = await executeSearch(config, { query: "pi" }, undefined, { provider });

		const text = firstText(result);
		expect(text).toContain("tavily");
		expect(text).toContain("示例结果");
		expect(text).toContain("https://example.com/a");
		expect(text).toContain("这是摘要");
		expect(result.details).toMatchObject({ provider: "tavily", query: "pi", count: 2, truncated: false });
	});

	it("provider 参数覆盖 config.provider", async () => {
		const { provider } = fakeProvider("brave", RESULTS);
		const braveConfig = makeConfig({ provider: "tavily", apiKeys: { brave: "brave-key" } });

		const result = await executeSearch(braveConfig, { query: "q", provider: "brave" }, undefined, { provider });

		expect(result.details.provider).toBe("brave");
	});

	it("缺 key 时抛错并指明环境变量与配置键", async () => {
		const { provider } = fakeProvider("tavily", RESULTS);

		const error = await rejectionOf(executeSearch(makeConfig({ apiKeys: {} }), { query: "q" }, undefined, { provider }));

		expect(error.message).toContain("TAVILY_API_KEY");
		expect(error.message).toContain("config.apiKeys.tavily");
	});

	it("无结果时仍返回成功信封", async () => {
		const { provider } = fakeProvider("tavily", []);

		const result = await executeSearch(config, { query: "空" }, undefined, { provider });

		expect(firstText(result)).toContain("No results returned");
		expect(result.details.count).toBe(0);
	});

	it("工具名与 provider 枚举来自配置", () => {
		const tool = createSearchTool(makeConfig({ tools: { web_search: { enabled: true, name: "find_web" } } }));

		expect(tool.name).toBe("find_web");
		expect(JSON.stringify(tool.parameters)).toContain("brave");
	});
});
