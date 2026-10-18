import type { GhExecResult, GhExecutor, HandlerContext } from "../../handlers/types.ts";

export const ISSUE = {
	title: "崩溃：设置页空白",
	number: 7,
	state: "OPEN",
	stateReason: null,
	author: { login: "alice" },
	createdAt: "2026-01-02T03:04:05Z",
	closedAt: null,
	labels: [{ name: "bug" }, { name: "p1" }],
	assignees: [{ login: "bob" }],
	milestone: null,
	comments: [{ author: { login: "bob" }, createdAt: "2026-01-03T00:00:00Z", body: "我也遇到了" }],
	body: "打开设置页就白屏。",
	url: "https://github.com/o/r/issues/7",
};

export const PULL = {
	title: "修复设置页白屏",
	number: 12,
	state: "MERGED",
	isDraft: false,
	author: { login: "carol" },
	baseRefName: "main",
	headRefName: "fix/settings",
	createdAt: "2026-01-04T00:00:00Z",
	mergedAt: "2026-01-05T00:00:00Z",
	closedAt: "2026-01-05T00:00:00Z",
	labels: [{ name: "bug" }],
	additions: 10,
	deletions: 2,
	changedFiles: 1,
	comments: [],
	body: "把 null 判断补上。",
	url: "https://github.com/o/r/pull/12",
};

export const RELEASE = {
	tagName: "v0.2.0",
	name: "0.2.0",
	isDraft: false,
	isPrerelease: false,
	publishedAt: "2026-02-01T00:00:00Z",
	author: { login: "dave" },
	body: "修复若干问题",
	url: "https://github.com/o/r/releases/tag/v0.2.0",
};

export const REPO = {
	name: "r",
	description: "示例仓库",
	url: "https://github.com/o/r",
	stargazerCount: 12,
	forkCount: 3,
	defaultBranchRef: { name: "main" },
	primaryLanguage: { name: "TypeScript" },
	licenseInfo: { spdxId: "MIT" },
	updatedAt: "2026-03-01T00:00:00Z",
	homepageUrl: null,
};

const OK_VERSION: GhExecResult = { ok: true, stdout: "gh version 2.60.0", stderr: "" };
const OK_AUTH: GhExecResult = { ok: true, stdout: "Logged in", stderr: "" };

export interface GhStubOptions {
	/** 业务命令（两次探测之后）的返回；默认失败，用来暴露不该发生的调用。 */
	reply?: (args: string[]) => GhExecResult;
	/** `--version` 探测的返回，默认成功。 */
	version?: GhExecResult;
	/** `auth status` 探测的返回，默认成功。 */
	auth?: GhExecResult;
}

/**
 * 假 gh 执行器：吃掉 `--version` 与 `auth status` 两次可用性探测，业务命令交给 reply。
 * 记录全部调用 —— `calls[0]` / `calls[1]` 是探测，`calls[2]` 起是业务。
 */
export function ghStub(options: GhStubOptions = {}): { exec: GhExecutor; calls: string[][] } {
	const calls: string[][] = [];
	const exec: GhExecutor = async (_command, args) => {
		calls.push(args);
		if (args[0] === "--version") return options.version ?? OK_VERSION;
		if (args[0] === "auth") return options.auth ?? OK_AUTH;
		return (
			options.reply?.(args) ?? {
				ok: false,
				stdout: "",
				stderr: "",
				error: `unexpected gh call: ${args.join(" ")}`,
			}
		);
	};
	return { exec, calls };
}

export function baseContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
	return {
		github: { enabled: true, command: "gh", timeoutMs: 10_000, maxChars: 150_000 },
		reddit: { enabled: true, baseUrl: "https://redlib.catsarch.com" },
		...overrides,
	};
}
