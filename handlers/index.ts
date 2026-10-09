/** handler 注册表：按序匹配，MVP 只有 GitHub。 */

import { githubHandler } from "./github/index.ts";
import type { HandlerContext, HandlerSkip, HandlerSuccess, PageHandler } from "./types.ts";

export * from "./types.ts";

export const PAGE_HANDLERS: readonly PageHandler[] = [githubHandler];

export interface HandlerRunResult {
	result: HandlerSuccess | null;
	skips: HandlerSkip[];
}

/** 命中且成功即返回；命中但跳过则记录原因后继续试下一个（透明顺延）。 */
export async function runPageHandlers(url: URL, ctx: HandlerContext): Promise<HandlerRunResult> {
	const skips: HandlerSkip[] = [];
	for (const handler of PAGE_HANDLERS) {
		if (!handler.match(url)) continue;
		const outcome = await handler.run(url, ctx);
		if (outcome?.kind === "handled") return { result: outcome, skips };
		if (outcome?.kind === "skipped") skips.push(outcome);
	}
	return { result: null, skips };
}
