/**
 * DeepSeek 搜索：POST /v1/tools/search，Bearer 认证，body `{ query, count }`。
 * 走自研搜索索引返回结构化结果，不是模型问答接口。
 */

import { type ProviderRuntime, type SearchProvider, type SearchResult, toSearchResult } from "./types.ts";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

interface DeepSeekResponse {
	results?: Array<{ title?: string; url?: string; summary?: string; snippet?: string }>;
}

export function createDeepSeekProvider(runtime: ProviderRuntime): SearchProvider {
	const endpoint = `${runtime.baseUrl ?? DEEPSEEK_BASE_URL}/v1/tools/search`;
	return {
		id: "deepseek",
		async search({ query, maxResults, signal }): Promise<SearchResult[]> {
			const { data } = await runtime.http.fetchJson<DeepSeekResponse>(endpoint, {
				method: "POST",
				headers: { authorization: `Bearer ${runtime.apiKey}`, "content-type": "application/json" },
				body: JSON.stringify({ query, count: maxResults }),
				signal,
			});

			const results: SearchResult[] = [];
			for (const item of data.results ?? []) {
				// summary 是官方标注「给模型读」的长摘要（600–800 字符），snippet 是 UI 用短摘要
				const mapped = toSearchResult({ title: item.title, url: item.url, snippet: item.summary ?? item.snippet });
				if (mapped) results.push(mapped);
			}
			return results;
		},
	};
}
