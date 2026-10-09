/** Brave：GET /web/search，`X-Subscription-Token` 认证，query 参数 `q` / `count`。 */

import { type ProviderRuntime, type SearchProvider, type SearchResult, toSearchResult } from "./types.ts";

export const BRAVE_BASE_URL = "https://api.search.brave.com/res/v1";

interface BraveResponse {
	web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
}

export function createBraveProvider(runtime: ProviderRuntime): SearchProvider {
	return {
		id: "brave",
		async search({ query, maxResults, signal }): Promise<SearchResult[]> {
			const params = new URLSearchParams({ q: query, count: String(maxResults) });
			const endpoint = `${runtime.baseUrl ?? BRAVE_BASE_URL}/web/search?${params.toString()}`;
			const { data } = await runtime.http.fetchJson<BraveResponse>(endpoint, {
				headers: { "x-subscription-token": runtime.apiKey, accept: "application/json" },
				signal,
			});

			const results: SearchResult[] = [];
			for (const item of data.web?.results ?? []) {
				const mapped = toSearchResult({ title: item.title, url: item.url, snippet: item.description });
				if (mapped) results.push(mapped);
			}
			return results;
		},
	};
}
