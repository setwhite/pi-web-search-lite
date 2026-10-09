/** Tavily 提取：POST /extract，Bearer 认证，body `{ urls: [url] }`。 */

import { PROVIDER_ENV_KEYS } from "../config/index.ts";
import type { ExtractedContent, Extractor, ExtractorContext } from "./types.ts";

export const TAVILY_API_BASE = "https://api.tavily.com";

interface TavilyExtractResponse {
	results?: Array<{ url?: string; title?: string; raw_content?: string }>;
	failed_results?: Array<{ url?: string; error?: string }>;
}

export function createTavilyExtractor(baseUrl = TAVILY_API_BASE): Extractor {
	const endpoint = `${baseUrl}/extract`;
	return {
		id: "tavily",
		unavailableReason: (ctx) =>
			ctx.apiKeys.tavily?.trim() ? null : `not configured (${PROVIDER_ENV_KEYS.tavily} env var or config.apiKeys.tavily)`,
		async extract(url, ctx: ExtractorContext): Promise<ExtractedContent> {
			const apiKey = ctx.apiKeys.tavily?.trim() ?? "";
			const { data } = await ctx.http.fetchJson<TavilyExtractResponse>(endpoint, {
				method: "POST",
				headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
				body: JSON.stringify({ urls: [url] }),
				signal: ctx.signal,
			});

			const failed = data.failed_results?.[0];
			if (failed) throw new Error(`extract failed: ${failed.error ?? "unknown error"}`);
			const result = data.results?.[0];
			if (!result?.raw_content) throw new Error("response has no raw_content");
			return { url: result.url ?? url, title: result.title, content: result.raw_content };
		},
	};
}

export const tavilyExtractor = createTavilyExtractor();
