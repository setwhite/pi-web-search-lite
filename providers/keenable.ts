import {
	type ProviderRuntime,
	type SearchProvider,
	type SearchResult,
	toSearchResult,
} from "./types.ts";

export const KEENABLE_BASE_URL = "https://api.keenable.ai";

interface KeenableResponse {
	results?: Array<{ title?: string; url?: string; snippet?: string; description?: string }>;
}

export function createKeenableProvider(runtime: ProviderRuntime): SearchProvider {
	const endpoint = `${runtime.baseUrl ?? KEENABLE_BASE_URL}/v1/search`;
	return {
		id: "keenable",
		async search({ query, maxResults, signal }): Promise<SearchResult[]> {
			const { data } = await runtime.http.fetchJson<KeenableResponse>(endpoint, {
				method: "POST",
				headers: { "x-api-key": runtime.apiKey, "content-type": "application/json" },
				body: JSON.stringify({ query, max_results: maxResults }),
				signal,
			});

			const results: SearchResult[] = [];
			for (const item of data.results ?? []) {
				// snippet 是正文摘录、description 是短语摘要：模型读前者更有用
				const mapped = toSearchResult({
					title: item.title,
					url: item.url,
					snippet: item.snippet ?? item.description,
				});
				if (mapped) results.push(mapped);
			}
			return results;
		},
	};
}
