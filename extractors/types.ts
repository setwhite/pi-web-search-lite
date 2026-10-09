/**
 * extractor 层契约：`web_fetch` 的提取器链。
 * 缺 key → 跳过（不发请求、不计失败）；抛错或内容过短 → 记因试下一个；全部失败 → 汇总原因抛错。
 */

import type { ApiKeyId, ExtractorId } from "../config/index.ts";
import type { HttpClient } from "../http/index.ts";

export interface ExtractedContent {
	/** 最终 URL（可能经重定向）。 */
	url: string;
	title?: string;
	content: string;
}

export interface ExtractorContext {
	http: HttpClient;
	/** 已由配置层合并环境变量；缺 key 的提取器会被跳过。 */
	apiKeys: Partial<Record<ApiKeyId, string>>;
	minChars: number;
	maxCharsPerPage: number;
	signal?: AbortSignal;
}

export interface Extractor {
	readonly id: ExtractorId;
	/** 不可用（缺 key）时的跳过原因；null = 可用。 */
	unavailableReason(ctx: ExtractorContext): string | null;
	/** 抓取并提取；失败直接抛错，由链记录后顺延。 */
	extract(url: string, ctx: ExtractorContext): Promise<ExtractedContent>;
}

export type ExtractAttemptStatus = "skipped" | "failed";

export interface ExtractAttempt {
	extractor: ExtractorId;
	status: ExtractAttemptStatus;
	reason: string;
}

/** 链全部失败时抛出，`attempts` 含每个提取器的名字与原因。 */
export class ExtractError extends Error {
	readonly attempts: ExtractAttempt[];

	constructor(message: string, attempts: ExtractAttempt[]) {
		super(message);
		this.name = "ExtractError";
		this.attempts = attempts;
	}
}

/** 链成功后的产出：带提取器来源与截断标记。 */
export interface ExtractedPage extends ExtractedContent {
	extractor: ExtractorId;
	truncated: boolean;
}
