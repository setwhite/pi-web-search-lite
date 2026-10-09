/**
 * Jina Reader：GET `https://r.jina.ai/<url>`，`Accept: application/json`。
 * 无 key 也能用（官方 20 RPM，配置了 key 走更高配额），因此不因缺 key 跳过。
 */

import type { ExtractedContent, Extractor, ExtractorContext } from "./types.ts";

export const JINA_READER_BASE = "https://r.jina.ai";

interface JinaReaderResponse {
	code?: number;
	message?: string;
	data?: { url?: string; title?: string; content?: string };
}

export function createJinaExtractor(baseUrl = JINA_READER_BASE): Extractor {
	return {
		id: "jina",
		unavailableReason: () => null,
		async extract(url, ctx: ExtractorContext): Promise<ExtractedContent> {
			const apiKey = ctx.apiKeys.jina?.trim();
			const headers: Record<string, string> = { accept: "application/json" };
			if (apiKey) headers.authorization = `Bearer ${apiKey}`;
			const { data } = await ctx.http.fetchJson<JinaReaderResponse>(`${baseUrl}/${url}`, { headers, signal: ctx.signal });

			if (data.code !== 200) throw new Error(`reader failed: ${data.message ?? `code ${data.code ?? "unknown"}`}`);
			const content = data.data?.content;
			if (!content) throw new Error("response has no content");
			return { url: data.data?.url ?? url, title: data.data?.title, content };
		},
	};
}

export const jinaExtractor = createJinaExtractor();
