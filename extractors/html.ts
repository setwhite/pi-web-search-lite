/** 本地 HTML 提取：零依赖正则五步法（剥 script/style/noscript → 块级标签转换行 → 去标签 → 解实体 → 压空白）。 */

import type { ExtractedContent, Extractor } from "./types.ts";

/** 这些内容类型不押注在 HTML 提取上，直接抛错顺延。 */
const BINARY_CONTENT_TYPES = [/^image\//, /^audio\//, /^video\//, /^application\/(?:pdf|zip|octet-stream|x-7z-compressed)/];

const BLOCK_TAGS =
	/<\/?(?:br|p|div|section|article|header|footer|main|aside|nav|figure|figcaption|dl|dt|dd|form|fieldset|li|ul|ol|tr|td|th|table|caption|h[1-6]|blockquote|pre|hr)\b[^>]*\/?>/gi;

export const htmlExtractor: Extractor = {
	id: "html",
	unavailableReason: () => null,
	async extract(url, ctx): Promise<ExtractedContent> {
		const response = await ctx.http.fetchText(url, { signal: ctx.signal });
		const contentType = response.contentType?.toLowerCase() ?? "";
		if (BINARY_CONTENT_TYPES.some((pattern) => pattern.test(contentType))) {
			throw new Error(`不支持的内容类型：${contentType || "未知"}`);
		}
		return { url: response.url, title: extractTitle(response.text), content: htmlToText(response.text) };
	},
};

/** `<title>` 文本：先去标签、解实体、压空白；没有时返回 undefined。 */
export function extractTitle(html: string): string | undefined {
	const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
	if (!match) return undefined;
	const title = collapse(decodeEntities(match[1].replace(/<[^>]*>/g, " ")));
	return title === "" ? undefined : title;
}

export function htmlToText(html: string): string {
	const withoutNoise = html
		.replace(/<(script|style|noscript|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
		.replace(/<(?:meta|link)\b[^>]*\/?>/gi, " ");
	const withBreaks = withoutNoise.replace(BLOCK_TAGS, "\n");
	const stripped = withBreaks.replace(/<[^>]*>/g, " ");
	return collapse(decodeEntities(stripped));
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

function decodeEntities(text: string): string {
	return text
		.replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => codePoint(Number.parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_match, dec: string) => codePoint(Number.parseInt(dec, 10)))
		.replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/** 非法码点（0、代理区、超界）返回空串：宁可丢字，也不往正文里塞 NUL / 孤立代理。 */
function codePoint(value: number): string {
	if (value <= 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return "";
	try {
		return String.fromCodePoint(value);
	} catch {
		return "";
	}
}

function collapse(text: string): string {
	return text
		.replace(/\r\n?/g, "\n")
		.replace(/[^\S\n]+/g, " ")
		.replace(/ *\n */g, "\n")
		.replace(/\n{2,}/g, "\n")
		.trim();
}
