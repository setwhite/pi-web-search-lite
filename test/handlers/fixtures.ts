import type { HandlerContext } from "../../handlers/types.ts";

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

export function baseContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
	return {
		github: { enabled: true, command: "gh", timeoutMs: 10_000, maxChars: 150_000 },
		...overrides,
	};
}
