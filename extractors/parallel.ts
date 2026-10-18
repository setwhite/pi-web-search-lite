/** Parallel 提取：POST /v1/extract，`x-api-key` 认证；要 `full_content` 才拿得到整页 markdown。 */

import { API_KEY_ENV_KEYS } from "../config/index.ts";
import type { ExtractedContent, Extractor, ExtractorContext } from "./types.ts";

export const PARALLEL_API_BASE = "https://api.parallel.ai";

interface ParallelExtractResponse {
	results?: Array<{ url?: string; title?: string; full_content?: string }>;
	errors?: Array<{ url?: string; error_type?: string; http_status_code?: number; content?: string }>;
}

export function createParallelExtractor(baseUrl = PARALLEL_API_BASE): Extractor {
	const endpoint = `${baseUrl}/v1/extract`;
	return {
		id: "parallel",
		unavailableReason: (ctx) =>
			ctx.apiKeys.parallel?.trim() ? null : `not configured (${API_KEY_ENV_KEYS.parallel} env var or config.apiKeys.parallel)`,
		async extract(url, ctx: ExtractorContext): Promise<ExtractedContent> {
			const apiKey = ctx.apiKeys.parallel?.trim() ?? "";
			const { data } = await ctx.http.fetchJson<ParallelExtractResponse>(endpoint, {
				method: "POST",
				headers: { "x-api-key": apiKey, "content-type": "application/json" },
				body: JSON.stringify({ urls: [url], advanced_settings: { full_content: true } }),
				signal: ctx.signal,
			});

			// 单个 URL 的失败在 errors 里；v1 只认 advanced_settings.full_content（顶层的 v1beta 字段会 422）
			const failure = data.errors?.[0];
			if (failure) {
				const status = failure.http_status_code ? ` (HTTP ${failure.http_status_code})` : "";
				throw new Error(`extract failed: ${failure.error_type ?? "unknown error"}${status}`);
			}
			const result = data.results?.[0];
			if (!result?.full_content) throw new Error("response has no full_content");
			return { url: result.url ?? url, title: result.title, content: result.full_content };
		},
	};
}

export const parallelExtractor = createParallelExtractor();
