/**
 * Parallel Search API：POST /v1/search，`x-api-key` 认证。
 * 官方把 `mode: "fast"` 列为 agent 工具调用的推荐档（约 700ms）；默认档 advanced 约 3s，故显式指定。
 */

import {
	type ProviderRuntime,
	type SearchProvider,
	type SearchResult,
	toSearchResult,
} from "./types.ts";

export const PARALLEL_BASE_URL = "https://api.parallel.ai";
/** 检索档位：turbo / fast / basic / advanced，见 https://docs.parallel.ai/search/modes。 */
export const PARALLEL_SEARCH_MODE = "fast";

interface ParallelResponse {
	results?: Array<{ title?: string; url?: string; excerpts?: string[] }>;
}

export function createParallelProvider(runtime: ProviderRuntime): SearchProvider {
	const endpoint = `${runtime.baseUrl ?? PARALLEL_BASE_URL}/v1/search`;
	return {
		id: "parallel",
		async search({ query, maxResults, signal }): Promise<SearchResult[]> {
			const { data } = await runtime.http.fetchJson<ParallelResponse>(endpoint, {
				method: "POST",
				headers: { "x-api-key": runtime.apiKey, "content-type": "application/json" },
				// 只发 search_queries：工具层的 query 是检索式；objective 要自包含的自然语言目标
				body: JSON.stringify({
					mode: PARALLEL_SEARCH_MODE,
					search_queries: [query],
					advanced_settings: { max_results: maxResults },
				}),
				signal,
			});

			const results: SearchResult[] = [];
			for (const item of data.results ?? []) {
				const mapped = toSearchResult({
					title: item.title,
					url: item.url,
					snippet: item.excerpts?.join(" "),
				});
				if (mapped) results.push(mapped);
			}
			return results;
		},
	};
}
