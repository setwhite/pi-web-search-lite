/**
 * GitHub 专用 handler：URL 解析 + 调用 gh CLI + 渲染。
 * 不 clone、不落盘、不发 HTTP；gh 不可用或执行失败时返回 skipped（原因交给工具层注明）。
 */

import type { HandlerSkip, HandlerSuccess, PageHandler } from "../types.ts";
import { checkGhAvailable, execGh, GH_MAX_BUFFER, ghEnv, shortDetail } from "./gh.ts";
import { renderTarget } from "./render.ts";

export type GitHubTarget =
	| { kind: "repo"; owner: string; repo: string }
	| { kind: "blob"; owner: string; repo: string; ref: string; path: string }
	| { kind: "tree"; owner: string; repo: string; ref: string; path: string }
	| { kind: "issue"; owner: string; repo: string; number: number }
	| { kind: "pull"; owner: string; repo: string; number: number; files: boolean }
	| { kind: "release"; owner: string; repo: string; tag: string };

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
/** 2 段路径才会被当成仓库，这些首段其实是站内路由。 */
const RESERVED_FIRST_SEGMENTS = new Set([
	"about", "apps", "codespaces", "collections", "dashboard", "enterprise", "explore", "features", "issues", "join",
	"login", "marketplace", "new", "notifications", "orgs", "pricing", "pulls", "search", "settings", "site",
	"sponsors", "topics", "trending",
]);

const REPO_FIELDS = [
	"name", "description", "url", "stargazerCount", "forkCount", "defaultBranchRef", "primaryLanguage", "licenseInfo", "updatedAt",
];
const ISSUE_FIELDS = [
	"title", "number", "state", "stateReason", "author", "createdAt", "closedAt", "labels", "assignees", "milestone",
	"comments", "body", "url",
];
const ISSUE_CORE_FIELDS = [
	"title", "number", "state", "author", "createdAt", "closedAt", "labels", "assignees", "milestone", "comments", "body", "url",
];
const PR_FIELDS = [
	"title", "number", "state", "isDraft", "author", "baseRefName", "headRefName", "createdAt", "mergedAt", "closedAt",
	"labels", "additions", "deletions", "changedFiles", "comments", "body", "url",
];
const PR_CORE_FIELDS = [
	"title", "number", "state", "isDraft", "author", "baseRefName", "headRefName", "createdAt", "mergedAt", "closedAt",
	"labels", "additions", "deletions", "changedFiles", "comments", "body", "url",
];
const RELEASE_FIELDS = ["tagName", "name", "isDraft", "isPrerelease", "publishedAt", "author", "body", "url"];

export const githubHandler: PageHandler = {
	name: "github",
	match: (url) => parseGitHubUrl(url) !== null,
	async run(url, ctx) {
		const target = parseGitHubUrl(url);
		if (!target) return null;
		const settings = ctx.github;
		if (!settings.enabled) {
			return skip("handlers.github.enabled is false; GitHub-specific handling skipped");
		}

		const exec = ctx.execGh ?? execGh;
		const env = ghEnv(ctx.proxy);
		const availability = await checkGhAvailable(settings.command, {
			exec,
			timeoutMs: settings.timeoutMs,
			env,
			signal: ctx.signal,
		});
		if (!availability.ok) return skip(availability.reason);

		const outputs: string[] = [];
		for (const [index, step] of planSteps(target).entries()) {
			const runOptions = { timeoutMs: settings.timeoutMs, maxBuffer: GH_MAX_BUFFER, env, signal: ctx.signal };
			let result = await exec(settings.command, step.args, runOptions);
			if (!result.ok && step.coreArgs && isUnknownFieldError(result)) {
				result = await exec(settings.command, step.coreArgs, runOptions);
			}
			if (!result.ok) {
				// 首条命令失败 = 整个 handler 放弃；附加内容（如 README）失败则忽略
				if (index === 0) return skip(`gh ${step.args[0]} failed: ${shortDetail(result)}`);
				break;
			}
			outputs.push(result.stdout);
		}

		const page = renderTarget(target, outputs, settings.maxChars);
		const handled: HandlerSuccess = { kind: "handled", handler: "github", url: url.toString(), ...page };
		return handled;
	},
};

/** 解析 6 类 GitHub 页面；query 与锚点忽略，其余形态返回 null 交给提取器链。 */
export function parseGitHubUrl(url: URL): GitHubTarget | null {
	if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;

	const segments: string[] = [];
	for (const part of url.pathname.split("/")) {
		if (part === "") continue;
		try {
			segments.push(decodeURIComponent(part));
		} catch {
			return null;
		}
	}
	if (segments.length < 2) return null;

	const owner = segments[0];
	const repo = segments[1].replace(/\.git$/, "");
	if (!isOwner(owner) || !isRepo(repo)) return null;
	if (segments.length === 2) {
		return RESERVED_FIRST_SEGMENTS.has(owner.toLowerCase()) ? null : { kind: "repo", owner, repo };
	}

	const slug = { owner, repo };
	switch (segments[2].toLowerCase()) {
		case "blob": {
			if (segments.length < 5) return null;
			const ref = safeRef(segments[3]);
			return ref === null ? null : { kind: "blob", ...slug, ref, path: segments.slice(4).join("/") };
		}
		case "tree": {
			if (segments.length < 4) return null;
			const ref = safeRef(segments[3]);
			return ref === null ? null : { kind: "tree", ...slug, ref, path: segments.slice(4).join("/") };
		}
		case "issues": {
			if (segments.length !== 4) return null;
			const number = positiveInt(segments[3]);
			return number === null ? null : { kind: "issue", ...slug, number };
		}
		case "pull": {
			if (segments.length < 4 || segments.length > 5) return null;
			const number = positiveInt(segments[3]);
			if (number === null) return null;
			if (segments.length === 5 && segments[4].toLowerCase() !== "files") return null;
			return { kind: "pull", ...slug, number, files: segments.length === 5 };
		}
		case "releases": {
			if (segments.length < 5 || segments[3].toLowerCase() !== "tag") return null;
			const tag = segments.slice(4).join("/");
			return tag === "" ? null : { kind: "release", ...slug, tag };
		}
		default:
			return null;
	}
}

interface GhStep {
	args: string[];
	/** gh 版本过旧不认某些 --json 字段时的回退命令。 */
	coreArgs?: string[];
}

function planSteps(target: GitHubTarget): GhStep[] {
	const repoSlug = `${target.owner}/${target.repo}`;
	switch (target.kind) {
		case "repo":
			return [
				{ args: ["repo", "view", repoSlug, "--json", REPO_FIELDS.join(",")] },
				{ args: ["api", `repos/${repoSlug}/readme`, "--jq", ".content"] },
			];
		case "blob": {
			const path = target.path.split("/").map(encodeURIComponent).join("/");
			return [{ args: ["api", "-H", "Accept: application/vnd.github.raw", `repos/${repoSlug}/contents/${path}?ref=${encodeURIComponent(target.ref)}`] }];
		}
		case "tree":
			return [{ args: ["api", `repos/${repoSlug}/git/trees/${encodeURIComponent(target.ref)}?recursive=1`, "--jq", ".tree[].path"] }];
		case "issue":
			return [
				{
					args: ["issue", "view", String(target.number), "--repo", repoSlug, "--json", ISSUE_FIELDS.join(",")],
					coreArgs: ["issue", "view", String(target.number), "--repo", repoSlug, "--json", ISSUE_CORE_FIELDS.join(",")],
				},
			];
		case "pull":
			return target.files
				? [{ args: ["pr", "diff", String(target.number), "--repo", repoSlug] }]
				: [
						{
							args: ["pr", "view", String(target.number), "--repo", repoSlug, "--json", PR_FIELDS.join(",")],
							coreArgs: ["pr", "view", String(target.number), "--repo", repoSlug, "--json", PR_CORE_FIELDS.join(",")],
						},
					];
		case "release":
			return [{ args: ["release", "view", target.tag, "--repo", repoSlug, "--json", RELEASE_FIELDS.join(",")] }];
	}
}

function isUnknownFieldError(result: { stderr: string; error?: string }): boolean {
	return /unknown (?:json )?field|UnknownField/i.test(`${result.stderr}\n${result.error ?? ""}`);
}

function skip(reason: string): HandlerSkip {
	return { kind: "skipped", handler: "github", reason };
}

function isOwner(value: string): boolean {
	return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value) && !value.includes("--");
}

function isRepo(value: string): boolean {
	return /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/.test(value);
}

function safeRef(segment: string | undefined): string | null {
	if (!segment || segment.length > 1024 || /[\0-\x1f\x7f]/.test(segment)) return null;
	return segment;
}

function positiveInt(segment: string | undefined): number | null {
	if (!segment || !/^\d+$/.test(segment)) return null;
	const value = Number.parseInt(segment, 10);
	return Number.isSafeInteger(value) && value > 0 ? value : null;
}
