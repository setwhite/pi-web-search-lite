/** Firecrawl：POST /v2/search，Bearer 认证，body `{ query, limit, sources: ["web"] }`。 */

import { type ProviderRuntime, type SearchProvider, type SearchResult, toSearchResult } from "./types.ts";

export const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev";

interface FirecrawlItem {
	title?: string;
	url?: string;
	description?: string;
}

interface FirecrawlResponse {
	success?: boolean;
	error?: string;
	/** v2 响应形状：`data.web[]`（另有 images / news / tools，本 provider 不取）。 */
	data?: { web?: FirecrawlItem[] };
}

/** 语法错误或配额问题会以 200 + `success: false` 返回，不能当空结果处理。 */
function assertSucceeded(data: FirecrawlResponse): void {
	if (data.success === false) throw new Error(`search failed: ${data.error ?? "unknown error"}`);
}

export function createFirecrawlProvider(runtime: ProviderRuntime): SearchProvider {
	const endpoint = `${runtime.baseUrl ?? FIRECRAWL_BASE_URL}/v2/search`;
	return {
		id: "firecrawl",
		async search({ query, maxResults, signal }): Promise<SearchResult[]> {
			const { data } = await runtime.http.fetchJson<FirecrawlResponse>(endpoint, {
				method: "POST",
				headers: { authorization: `Bearer ${runtime.apiKey}`, "content-type": "application/json" },
				body: JSON.stringify({ query, limit: maxResults, sources: ["web"] }),
				signal,
			});
			assertSucceeded(data);

			const items = data.data?.web ?? [];
			const results: SearchResult[] = [];
			for (const item of items) {
				const mapped = toSearchResult({ title: item.title, url: item.url, snippet: item.description });
				if (mapped) results.push(mapped);
			}
			return results;
		},
	};
}
