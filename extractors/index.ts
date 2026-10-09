/** 提取器注册表与链式编排：按配置顺序逐个尝试，第一个产出合格内容的赢。 */

import type { ExtractorId } from "../config/index.ts";
import { exaExtractor } from "./exa.ts";
import { htmlExtractor } from "./html.ts";
import { tavilyExtractor } from "./tavily.ts";
import { ExtractError, type ExtractAttempt, type ExtractedPage, type Extractor, type ExtractorContext } from "./types.ts";

export * from "./types.ts";

export const EXTRACTORS: Record<ExtractorId, Extractor> = {
	tavily: tavilyExtractor,
	exa: exaExtractor,
	html: htmlExtractor,
};

/**
 * 按 `order` 逐个尝试；成功且内容 ≥ minChars 即返回。
 * `extractors` 仅测试注入，生产缺省用 EXTRACTORS。
 */
export async function extractWithChain(
	url: string,
	order: readonly ExtractorId[],
	ctx: ExtractorContext,
	extractors: Record<ExtractorId, Extractor> = EXTRACTORS,
): Promise<ExtractedPage> {
	const attempts: ExtractAttempt[] = [];
	for (const id of order) {
		const extractor = extractors[id];
		try {
			// unavailableReason 也纳入 try：自定义提取器在这里抛错同样记因顺延，不绕过汇总
			const unavailable = extractor.unavailableReason(ctx);
			if (unavailable !== null) {
				attempts.push({ extractor: id, status: "skipped", reason: unavailable });
				continue;
			}
			const result = await extractor.extract(url, ctx);
			const content = result.content.trim();
			if (content.length < ctx.minChars) {
				attempts.push({ extractor: id, status: "failed", reason: `content too short (${content.length} < ${ctx.minChars} chars)` });
				continue;
			}
			const truncated = content.length > ctx.maxCharsPerPage;
			return {
				extractor: id,
				url: result.url,
				title: result.title?.trim() || result.url,
				content: truncated
					? `${content.slice(0, ctx.maxCharsPerPage)}\n\n[... truncated: original ${content.length} chars, kept first ${ctx.maxCharsPerPage} chars ...]`
					: content,
				truncated,
			};
		} catch (error) {
			attempts.push({ extractor: id, status: "failed", reason: error instanceof Error ? error.message : String(error) });
		}
	}
	throw new ExtractError(chainFailureText(attempts), attempts);
}

function chainFailureText(attempts: ExtractAttempt[]): string {
	const lines = attempts.map((attempt) => {
		const label = attempt.status === "skipped" ? "skipped" : "failed";
		return `- ${attempt.extractor}: ${label} (${attempt.reason})`;
	});
	return `all extractors failed to produce usable content (${attempts.length} tried):\n${lines.join("\n")}`;
}
