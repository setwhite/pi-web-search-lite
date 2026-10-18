/** DeepSeek 抓取：POST /v1/tools/fetch，Bearer 认证，body `{ url }`；返回整页 markdown。 */

import { API_KEY_ENV_KEYS } from "../config/index.ts";
import type { ExtractedContent, Extractor, ExtractorContext } from "./types.ts";

export const DEEPSEEK_API_BASE = "https://api.deepseek.com";

interface DeepSeekFetchResponse {
	title?: string;
	content?: string;
}

export function createDeepSeekExtractor(baseUrl = DEEPSEEK_API_BASE): Extractor {
	const endpoint = `${baseUrl}/v1/tools/fetch`;
	return {
		id: "deepseek",
		unavailableReason: (ctx) =>
			ctx.apiKeys.deepseek?.trim() ? null : `not configured (${API_KEY_ENV_KEYS.deepseek} env var or config.apiKeys.deepseek)`,
		async extract(url, ctx: ExtractorContext): Promise<ExtractedContent> {
			const apiKey = ctx.apiKeys.deepseek?.trim() ?? "";
			const { data } = await ctx.http.fetchJson<DeepSeekFetchResponse>(endpoint, {
				method: "POST",
				headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
				body: JSON.stringify({ url }),
				signal: ctx.signal,
			});

			if (!data.content) throw new Error("response has no content");
			return { url, title: data.title, content: data.content };
		},
	};
}

export const deepseekExtractor = createDeepSeekExtractor();
