/**
 * Perplexity Search API：POST /search，Bearer 认证，body `{ query, max_results }`。
 * 用的是返回原始排名结果的 Search API，不是产出 LLM 答案的 Agent / Sonar 接口。
 */

import { type ProviderRuntime, type SearchProvider, type SearchResult, toSearchResult } from "./types.ts";

export const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";

interface PerplexityResponse {
	results?: Array<{ title?: string; url?: string; snippet?: string }>;
}

export function createPerplexityProvider(runtime: ProviderRuntime): SearchProvider {
	const endpoint = `${runtime.baseUrl ?? PERPLEXITY_BASE_URL}/search`;
	return {
		id: "perplexity",
		async search({ query, maxResults, signal }): Promise<SearchResult[]> {
			const { data } = await runtime.http.fetchJson<PerplexityResponse>(endpoint, {
				method: "POST",
				headers: { authorization: `Bearer ${runtime.apiKey}`, "content-type": "application/json" },
				body: JSON.stringify({ query, max_results: maxResults }),
				signal,
			});

			const results: SearchResult[] = [];
			for (const item of data.results ?? []) {
				const mapped = toSearchResult({ title: item.title, url: item.url, snippet: item.snippet });
				if (mapped) results.push(mapped);
			}
			return results;
		},
	};
}
