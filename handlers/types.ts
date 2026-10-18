/**
 * handler 层契约：`web_fetch` 的第 0 步（在提取器链之前）。命中后有三种结局：
 * 直取正文（github 调 `gh`）、只把 URL 换个域名（reddit 换 redlib）交给链、或带上原因顺延（透明顺延，不是静默降级）。
 */

import type { GitHubHandlerSettings, RedditHandlerSettings } from "../config/index.ts";

export interface GhExecResult {
	ok: boolean;
	stdout: string;
	stderr: string;
	error?: string;
}

export interface GhRunOptions {
	timeoutMs: number;
	maxBuffer: number;
	env: NodeJS.ProcessEnv;
	signal?: AbortSignal;
}

/** gh 执行器签名；生产缺省用 gh.ts 的 execFile 实现，测试可注入。 */
export type GhExecutor = (
	command: string,
	args: string[],
	options: GhRunOptions,
) => Promise<GhExecResult>;

/** 已处理：markdown 正文，可能已按 maxChars 截断。 */
export interface HandlerSuccess {
	kind: "handled";
	handler: string;
	url: string;
	title: string;
	content: string;
	truncated: boolean;
}

/** 命中但未处理：工具层据此在结果里注明顺延原因。 */
export interface HandlerSkip {
	kind: "skipped";
	handler: string;
	reason: string;
}

/** 命中但只改 URL：工具层拿 `url` 继续走提取器链，并把 `from` 记进结果头。 */
export interface HandlerRewrite {
	kind: "rewrite";
	handler: string;
	/** 改写前的原 URL。 */
	from: string;
	/** 实际要去抓的 URL。 */
	url: string;
}

export type HandlerOutcome = HandlerSuccess | HandlerSkip | HandlerRewrite | null;

export interface HandlerContext {
	github: GitHubHandlerSettings;
	reddit: RedditHandlerSettings;
	/** 出站代理；gh 认 HTTPS_PROXY / HTTP_PROXY。 */
	proxy?: string;
	signal?: AbortSignal;
	/** 测试注入；缺省真跑 gh。 */
	execGh?: GhExecutor;
}

export interface PageHandler {
	readonly name: string;
	match(url: URL): boolean;
	/** null = 该 URL 不适用本 handler。 */
	run(url: URL, ctx: HandlerContext): Promise<HandlerOutcome>;
}
