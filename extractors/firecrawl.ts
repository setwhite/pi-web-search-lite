/** Firecrawl 提取：POST /v2/scrape，Bearer 认证，body `{ url, formats: ["markdown"] }`。 */

import { API_KEY_ENV_KEYS } from "../config/index.ts";
import type { ExtractedContent, Extractor, ExtractorContext } from "./types.ts";

export const FIRECRAWL_API_BASE = "https://api.firecrawl.dev";

interface FirecrawlScrapeResponse {
	success?: boolean;
	error?: string;
	data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } };
}

export function createFirecrawlExtractor(baseUrl = FIRECRAWL_API_BASE): Extractor {
	const endpoint = `${baseUrl}/v2/scrape`;
	return {
		id: "firecrawl",
		unavailableReason: (ctx) =>
			ctx.apiKeys.firecrawl?.trim() ? null : `not configured (${API_KEY_ENV_KEYS.firecrawl} env var or config.apiKeys.firecrawl)`,
		async extract(url, ctx: ExtractorContext): Promise<ExtractedContent> {
			const apiKey = ctx.apiKeys.firecrawl?.trim() ?? "";
			const { data } = await ctx.http.fetchJson<FirecrawlScrapeResponse>(endpoint, {
				method: "POST",
				headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
				body: JSON.stringify({ url, formats: ["markdown"] }),
				signal: ctx.signal,
			});

			if (data.success === false) throw new Error(`scrape failed: ${data.error ?? "unknown error"}`);
			const markdown = data.data?.markdown;
			if (!markdown) throw new Error("response has no markdown");
			return { url: data.data?.metadata?.sourceURL ?? url, title: data.data?.metadata?.title, content: markdown };
		},
	};
}

export const firecrawlExtractor = createFirecrawlExtractor();
