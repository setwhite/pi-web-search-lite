/** Exa：POST /search，`x-api-key` 认证；请求 `contents.text` 以填充 snippet。 */

import { type ProviderRuntime, type SearchProvider, type SearchResult, toSearchResult } from "./types.ts";

export const EXA_BASE_URL = "https://api.exa.ai";

/** snippet 只取正文前 300 字符，控制响应体积。 */
export const EXA_SNIPPET_MAX_CHARS = 300;

interface ExaResponse {
	results?: Array<{ title?: string; url?: string; text?: string }>;
}

export function createExaProvider(runtime: ProviderRuntime): SearchProvider {
	const endpoint = `${runtime.baseUrl ?? EXA_BASE_URL}/search`;
	return {
		id: "exa",
		async search({ query, maxResults, signal }): Promise<SearchResult[]> {
			const { data } = await runtime.http.fetchJson<ExaResponse>(endpoint, {
				method: "POST",
				headers: { "x-api-key": runtime.apiKey, "content-type": "application/json" },
				body: JSON.stringify({
					query,
					numResults: maxResults,
					contents: { text: { maxCharacters: EXA_SNIPPET_MAX_CHARS } },
				}),
				signal,
			});

			const results: SearchResult[] = [];
			for (const item of data.results ?? []) {
				const mapped = toSearchResult({ title: item.title, url: item.url, snippet: item.text });
				if (mapped) results.push(mapped);
			}
			return results;
		},
	};
}
