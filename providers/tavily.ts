/** Tavily：POST /search，Bearer 认证，body `{ query, max_results }`。 */

import { type ProviderRuntime, type SearchProvider, type SearchResult, toSearchResult } from "./types.ts";

export const TAVILY_BASE_URL = "https://api.tavily.com";

interface TavilyResponse {
	results?: Array<{ title?: string; url?: string; content?: string }>;
}

export function createTavilyProvider(runtime: ProviderRuntime): SearchProvider {
	const endpoint = `${runtime.baseUrl ?? TAVILY_BASE_URL}/search`;
	return {
		id: "tavily",
		async search({ query, maxResults, signal }): Promise<SearchResult[]> {
			const { data } = await runtime.http.fetchJson<TavilyResponse>(endpoint, {
				method: "POST",
				headers: { authorization: `Bearer ${runtime.apiKey}`, "content-type": "application/json" },
				body: JSON.stringify({ query, max_results: maxResults }),
				signal,
			});

			const results: SearchResult[] = [];
			for (const item of data.results ?? []) {
				const mapped = toSearchResult({ title: item.title, url: item.url, snippet: item.content });
				if (mapped) results.push(mapped);
			}
			return results;
		},
	};
}
