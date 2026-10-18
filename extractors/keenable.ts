/**
 * Keenable 提取：GET /v1/fetch?url=<url>&live=true，`X-API-Key` 认证。
 * live=true 才直取源站（按 fetch.live 计费）：默认档只返回索引副本，未索引的 URL 直接报错。
 */

import { API_KEY_ENV_KEYS } from "../config/index.ts";
import type { ExtractedContent, Extractor, ExtractorContext } from "./types.ts";

export const KEENABLE_API_BASE = "https://api.keenable.ai";

interface KeenableFetchResponse {
	url?: string;
	title?: string;
	content?: string;
}

export function createKeenableExtractor(baseUrl = KEENABLE_API_BASE): Extractor {
	return {
		id: "keenable",
		unavailableReason: (ctx) =>
			ctx.apiKeys.keenable?.trim()
				? null
				: `not configured (${API_KEY_ENV_KEYS.keenable} env var or config.apiKeys.keenable)`,
		async extract(url, ctx: ExtractorContext): Promise<ExtractedContent> {
			const apiKey = ctx.apiKeys.keenable?.trim() ?? "";
			const endpoint = `${baseUrl}/v1/fetch?url=${encodeURIComponent(url)}&live=true`;
			const { data } = await ctx.http.fetchJson<KeenableFetchResponse>(endpoint, {
				headers: { "x-api-key": apiKey },
				signal: ctx.signal,
			});

			if (!data.content) throw new Error("response has no content");
			return { url: data.url ?? url, title: data.title, content: data.content };
		},
	};
}

export const keenableExtractor = createKeenableExtractor();
