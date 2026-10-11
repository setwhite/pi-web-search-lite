/** handler 注册表：按序匹配。命中且接管 → 直接用；只改写 → 换 URL 后交给提取器链。 */

import { githubHandler } from "./github/index.ts";
import { redditHandler } from "./reddit/index.ts";
import type { HandlerContext, HandlerRewrite, HandlerSkip, HandlerSuccess, PageHandler } from "./types.ts";

export * from "./types.ts";

export const PAGE_HANDLERS: readonly PageHandler[] = [githubHandler, redditHandler];

export interface HandlerRunResult {
	result: HandlerSuccess | null;
	skips: HandlerSkip[];
	/** 命中且只做改写的 handler 给出的目标 URL；工具层据此抓取并在结果里注明原 URL。 */
	rewrite?: HandlerRewrite;
}

/** 接管即返回；只改写则按改写后的 URL 继续；跳过就记下原因再试下一个（透明顺延）。 */
export async function runPageHandlers(url: URL, ctx: HandlerContext): Promise<HandlerRunResult> {
	const skips: HandlerSkip[] = [];
	for (const handler of PAGE_HANDLERS) {
		if (!handler.match(url)) continue;
		const outcome = await handler.run(url, ctx);
		if (outcome?.kind === "handled") return { result: outcome, skips };
		if (outcome?.kind === "rewrite") return { result: null, skips, rewrite: outcome };
		if (outcome?.kind === "skipped") skips.push(outcome);
	}
	return { result: null, skips };
}
