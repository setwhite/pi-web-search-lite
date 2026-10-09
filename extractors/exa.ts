/** Exa 提取：POST /contents，`x-api-key` 认证；`text.maxCharacters` 由 `fetch.maxCharsPerPage` 控制。 */

import { PROVIDER_ENV_KEYS } from "../config/index.ts";
import type { ExtractedContent, Extractor, ExtractorContext } from "./types.ts";

export const EXA_API_BASE = "https://api.exa.ai";

interface ExaContentsResponse {
	results?: Array<{ url?: string; title?: string; text?: string }>;
}

export function createExaExtractor(baseUrl = EXA_API_BASE): Extractor {
	const endpoint = `${baseUrl}/contents`;
	return {
		id: "exa",
		unavailableReason: (ctx) => (ctx.apiKeys.exa?.trim() ? null : `未配置 ${PROVIDER_ENV_KEYS.exa} / config.apiKeys.exa`),
		async extract(url, ctx: ExtractorContext): Promise<ExtractedContent> {
			const apiKey = ctx.apiKeys.exa?.trim() ?? "";
			const { data } = await ctx.http.fetchJson<ExaContentsResponse>(endpoint, {
				method: "POST",
				headers: { "x-api-key": apiKey, "content-type": "application/json" },
				body: JSON.stringify({ ids: [url], text: { maxCharacters: ctx.maxCharsPerPage } }),
				signal: ctx.signal,
			});

			const result = data.results?.[0];
			if (!result?.text) throw new Error("响应里没有 text");
			return { url: result.url ?? url, title: result.title, content: result.text };
		},
	};
}

export const exaExtractor = createExaExtractor();
