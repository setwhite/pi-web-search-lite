/**
 * handler 层契约：`web_fetch` 的第 0 步，专用页面直取（MVP 只有 GitHub）。
 * 命中且成功 → 跳过提取器链；命中但跳过 → 带上原因顺延（透明顺延，不是静默降级）。
 */

import type { GitHubHandlerSettings } from "../config/index.ts";

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
export type GhExecutor = (command: string, args: string[], options: GhRunOptions) => Promise<GhExecResult>;

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

export interface HandlerContext {
	github: GitHubHandlerSettings;
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
	run(url: URL, ctx: HandlerContext): Promise<HandlerSuccess | HandlerSkip | null>;
}
