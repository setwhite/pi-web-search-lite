/**
 * provider 契约：统一结果形状、运行时依赖与共享映射工具。
 * 各 provider 只负责把一次查询翻译成自家 API 的请求与响应。
 */

import type { ProviderId } from "../config/index.ts";
import type { HttpClient } from "../http/index.ts";

/** 模型可见的统一搜索结果。 */
export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface SearchOptions {
	query: string;
	/** 已由调用方按配置 clamp 到 1..search.maxResultsLimit。 */
	maxResults: number;
	signal?: AbortSignal;
}

/** 创建 provider 时注入的共享依赖。 */
export interface ProviderRuntime {
	http: HttpClient;
	apiKey: string;
	/** 覆盖 API 根地址（测试桩用）；缺省为各 provider 的真实端点。 */
	baseUrl?: string;
}

export interface SearchProvider {
	readonly id: ProviderId;
	search(options: SearchOptions): Promise<SearchResult[]>;
}

/** 统一映射：缺 title 用 url 顶替，snippet 折叠空白；缺 url 返回 undefined 由调用方丢弃。 */
export function toSearchResult(raw: { title?: string; url?: string; snippet?: string }): SearchResult | undefined {
	const url = raw.url?.trim();
	if (!url) return undefined;
	return {
		title: raw.title?.trim() || url,
		url,
		snippet: (raw.snippet ?? "").replace(/\s+/g, " ").trim(),
	};
}
