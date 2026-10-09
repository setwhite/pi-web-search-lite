/** 把 gh 的输出渲染成 markdown（标题 / 状态 / 作者 / 正文 / 评论），并按 maxChars 截断。零网络、零子进程。 */

import type { GitHubTarget } from "./index.ts";

const TREE_MAX_ENTRIES = 200;
const EMPTY_BODY = "_(empty body)_";

export interface TruncatedText {
	content: string;
	truncated: boolean;
}

export interface RenderedPage extends TruncatedText {
	title: string;
}

export function truncateText(content: string, maxChars: number): TruncatedText {
	if (content.length <= maxChars) return { content, truncated: false };
	const kept = content.slice(0, maxChars);
	return {
		content: `${kept}\n\n[... truncated: original ${content.length} chars, kept first ${maxChars} chars ...]`,
		truncated: true,
	};
}

export function renderTarget(target: GitHubTarget, outputs: string[], maxChars: number): RenderedPage {
	const first = outputs[0] ?? "";
	let page: { title: string; content: string };
	switch (target.kind) {
		case "repo":
			page = renderRepo(target, first, outputs[1]);
			break;
		case "blob":
			page = { title: `${target.owner}/${target.repo}/${target.path}`, content: renderBlob(target.path, first) };
			break;
		case "tree":
			page = { title: `${target.owner}/${target.repo}@${target.ref}`, content: renderTree(first) };
			break;
		case "issue":
			page = renderIssue(target, first);
			break;
		case "pull":
			page = target.files
				? { title: `${target.owner}/${target.repo}#${target.number} changes`, content: renderDiff(first) }
				: renderPull(target, first);
			break;
		case "release":
			page = renderRelease(target, first);
			break;
	}
	return { title: page.title, ...truncateText(page.content, maxChars) };
}

function renderRepo(
	target: Extract<GitHubTarget, { kind: "repo" }>,
	json: string,
	readmeBase64: string | undefined,
): { title: string; content: string } {
	const data = parseJson(json);
	const stars = num(data.stargazerCount);
	const forks = num(data.forkCount);
	const stats = stars === undefined ? undefined : forks === undefined ? String(stars) : `${stars} · Fork: ${forks}`;
	const lines = [`# ${target.owner}/${target.repo}`];
	const description = str(data.description);
	if (description) lines.push("", description);
	lines.push(
		"",
		...meta([
			["Default branch", str(record(data.defaultBranchRef)?.name)],
			["Star", stats],
			["Language", str(record(data.primaryLanguage)?.name)],
			["License", str(record(data.licenseInfo)?.spdxId)],
			["Updated", str(data.updatedAt)],
			["Link", str(data.url)],
		]),
	);
	const readme = decodeBase64(readmeBase64);
	if (readme) lines.push("", "## README", "", readme);
	return { title: `${target.owner}/${target.repo}`, content: lines.join("\n") };
}

function renderBlob(path: string, raw: string): string {
	return `# ${path}\n\n\`\`\`text\n${raw.trimEnd()}\n\`\`\``;
}

function renderTree(raw: string): string {
	const entries = raw
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
	const lines = ["```text", ...entries.slice(0, TREE_MAX_ENTRIES), "```"];
	if (entries.length > TREE_MAX_ENTRIES) {
		lines.push("", `(${entries.length} entries, showing first ${TREE_MAX_ENTRIES})`);
	}
	return lines.join("\n");
}

function renderIssue(
	target: Extract<GitHubTarget, { kind: "issue" }>,
	json: string,
): { title: string; content: string } {
	const data = parseJson(json);
	const number = num(data.number) ?? target.number;
	const heading = `#${number} ${str(data.title) ?? "(no title)"}`;
	const lines = [
		`# ${heading}`,
		"",
		...meta([
			["State", str(data.state)],
			["Author", authorLine(data.author)],
			["Created", str(data.createdAt)],
			["Closed", str(data.closedAt)],
			["Labels", names(data.labels, "name")],
			["Assignees", names(data.assignees, "login")],
			["Link", str(data.url)],
		]),
		"",
		"## Body",
		"",
		str(data.body) ?? EMPTY_BODY,
		...commentsSection(data.comments),
	];
	return { title: heading, content: lines.join("\n") };
}

function renderPull(
	target: Extract<GitHubTarget, { kind: "pull" }>,
	json: string,
): { title: string; content: string } {
	const data = parseJson(json);
	const number = num(data.number) ?? target.number;
	const heading = `#${number} ${str(data.title) ?? "(no title)"}`;
	const additions = num(data.additions);
	const deletions = num(data.deletions);
	const changed = num(data.changedFiles);
	const changes =
		additions === undefined || deletions === undefined
			? undefined
			: `+${additions} / -${deletions}${changed === undefined ? "" : ` (${changed} files)`}`;
	const draft = data.isDraft === true ? " (draft)" : "";
	const lines = [
		`# ${heading}`,
		"",
		...meta([
			["State", str(data.state) === undefined ? undefined : `${str(data.state)}${draft}`],
			["Author", authorLine(data.author)],
			["Branch", branchLine(data.headRefName, data.baseRefName)],
			["Changes", changes],
			["Created", str(data.createdAt)],
			["Merged", str(data.mergedAt)],
			["Labels", names(data.labels, "name")],
			["Link", str(data.url)],
		]),
		"",
		"## Body",
		"",
		str(data.body) ?? EMPTY_BODY,
		...commentsSection(data.comments),
	];
	return { title: heading, content: lines.join("\n") };
}

function renderDiff(diff: string): string {
	return `\`\`\`diff\n${diff.trimEnd()}\n\`\`\``;
}

function renderRelease(
	target: Extract<GitHubTarget, { kind: "release" }>,
	json: string,
): { title: string; content: string } {
	const data = parseJson(json);
	const tag = str(data.tagName) ?? target.tag;
	const name = str(data.name);
	const state = data.isDraft === true ? "draft" : data.isPrerelease === true ? "pre-release" : "published";
	const lines = [
		name && name !== tag ? `# ${tag} (${name})` : `# ${tag}`,
		"",
		...meta([
			["State", state],
			["Author", authorLine(data.author)],
			["Published", str(data.publishedAt)],
			["Link", str(data.url)],
		]),
		"",
		"## Body",
		"",
		str(data.body) ?? EMPTY_BODY,
	];
	return { title: tag, content: lines.join("\n") };
}

function commentsSection(value: unknown): string[] {
	const items = Array.isArray(value) ? value : [];
	if (items.length === 0) return [];
	const lines = ["", `## Comments (${items.length})`];
	for (const item of items) {
		const comment = record(item) ?? {};
		lines.push(
			"",
			`### @${person(comment.author) ?? "anonymous"} · ${str(comment.createdAt) ?? "unknown time"}`,
			"",
			str(comment.body) ?? EMPTY_BODY,
		);
	}
	return lines;
}

function meta(entries: Array<[string, string | undefined]>): string[] {
	return entries.filter((entry): entry is [string, string] => entry[1] !== undefined).map(([label, value]) => `- ${label}: ${value}`);
}

function authorLine(value: unknown): string | undefined {
	const login = person(value);
	return login === undefined ? undefined : `@${login}`;
}

function branchLine(head: unknown, base: unknown): string | undefined {
	const from = str(head);
	const to = str(base);
	if (from === undefined) return to === undefined ? undefined : `→ ${to}`;
	return to === undefined ? from : `${from} → ${to}`;
}

function names(value: unknown, key: "name" | "login"): string | undefined {
	const items = Array.isArray(value) ? value : [];
	const result = items.map((item) => str(record(item)?.[key])).filter((item): item is string => item !== undefined);
	return result.length === 0 ? undefined : result.join(", ");
}

function decodeBase64(value: string | undefined): string | undefined {
	const text = value?.trim();
	if (!text) return undefined;
	try {
		const decoded = Buffer.from(text, "base64").toString("utf-8").trim();
		return decoded === "" ? undefined : decoded;
	} catch {
		return undefined;
	}
}

function parseJson(text: string): Record<string, unknown> {
	try {
		return record(JSON.parse(text)) ?? {};
	} catch {
		return {};
	}
}

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function str(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function person(value: unknown): string | undefined {
	return str(record(value)?.login);
}
