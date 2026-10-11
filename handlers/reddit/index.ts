/**
 * Reddit 专用 handler：只做 URL 改写——把域名换成 redlib 实例，path 与 query 照抄。
 * 正文交给提取器链抓（不自己发 HTTP、不做提取）；媒体域（i./v./preview.redd.it）不碰。
 */

import type { HandlerRewrite, HandlerSkip, PageHandler } from "../types.ts";

/** 白名单列子域：站点路由域名都算，redd.it 下的媒体域刻意不在其中。 */
const REDDIT_HOSTS = new Set([
	"reddit.com",
	"www.reddit.com",
	"old.reddit.com",
	"new.reddit.com",
	"np.reddit.com",
	"m.reddit.com",
	"i.reddit.com",
	"redd.it",
	"www.redd.it",
]);

export const redditHandler: PageHandler = {
	name: "reddit",
	match: (url) => REDDIT_HOSTS.has(url.hostname.toLowerCase()),
	async run(url, ctx): Promise<HandlerRewrite | HandlerSkip | null> {
		if (!REDDIT_HOSTS.has(url.hostname.toLowerCase())) return null;
		if (!ctx.reddit.enabled) {
			return { kind: "skipped", handler: "reddit", reason: "handlers.reddit.enabled is false; Reddit host substitution skipped" };
		}
		return { kind: "rewrite", handler: "reddit", from: url.toString(), url: substituteHost(url, ctx.reddit.baseUrl) };
	},
};

/** 换域名（保留 baseUrl 的路径前缀），path 与 query 照抄，丢锚点。 */
export function substituteHost(url: URL, baseUrl: string): string {
	const base = new URL(baseUrl);
	base.pathname = `${base.pathname.replace(/\/+$/, "")}${url.pathname}`;
	base.search = url.search;
	base.hash = "";
	return base.toString();
}
