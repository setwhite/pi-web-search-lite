import { describe, expect, it } from "vitest";
import { renderTarget, truncateText } from "../../handlers/github/render.ts";
import type { GitHubTarget } from "../../handlers/github/index.ts";
import { ISSUE, PULL, RELEASE, REPO } from "./fixtures.ts";

const MAX = 150_000;

const repo: GitHubTarget = { kind: "repo", owner: "o", repo: "r" };
const blob: GitHubTarget = { kind: "blob", owner: "o", repo: "r", ref: "main", path: "src/a.ts" };
const tree: GitHubTarget = { kind: "tree", owner: "o", repo: "r", ref: "main", path: "" };
const issue: GitHubTarget = { kind: "issue", owner: "o", repo: "r", number: 7 };
const pull: GitHubTarget = { kind: "pull", owner: "o", repo: "r", number: 12, files: false };
const pullFiles: GitHubTarget = { kind: "pull", owner: "o", repo: "r", number: 12, files: true };
const release: GitHubTarget = { kind: "release", owner: "o", repo: "r", tag: "v0.2.0" };

describe("renderTarget", () => {
	it("仓库首页：信息 + README", () => {
		const readme = Buffer.from("# 标题\n仓库说明", "utf-8").toString("base64");
		const page = renderTarget(repo, [JSON.stringify(REPO), readme], MAX);

		expect(page.title).toBe("o/r");
		expect(page.content).toContain("# o/r");
		expect(page.content).toContain("示例仓库");
		expect(page.content).toContain("12");
		expect(page.content).toContain("TypeScript");
		expect(page.content).toContain("# 标题");
		expect(page.truncated).toBe(false);
	});

	it("blob：文件路径 + 原文", () => {
		const page = renderTarget(blob, ["const a = 1;\n"], MAX);

		expect(page.title).toBe("o/r/src/a.ts");
		expect(page.content).toContain("src/a.ts");
		expect(page.content).toContain("const a = 1;");
	});

	it("tree：路径列表 + 上限提示", () => {
		const page = renderTarget(tree, ["src/a.ts\nsrc/b.ts"], MAX);

		expect(page.title).toBe("o/r@main");
		expect(page.content).toContain("src/a.ts");
		expect(page.content).toContain("src/b.ts");
	});

	it("issue：标题 / 状态 / 作者 / 正文 / 评论", () => {
		const page = renderTarget(issue, [JSON.stringify(ISSUE)], MAX);

		expect(page.title).toBe("#7 崩溃：设置页空白");
		expect(page.content).toContain("崩溃：设置页空白");
		expect(page.content).toContain("OPEN");
		expect(page.content).toContain("@alice");
		expect(page.content).toContain("打开设置页就白屏。");
		expect(page.content).toContain("@bob");
		expect(page.content).toContain("我也遇到了");
		expect(page.content).toContain("bug");
	});

	it("pull：分支 / 变更行数 / 正文", () => {
		const page = renderTarget(pull, [JSON.stringify(PULL)], MAX);

		expect(page.title).toBe("#12 修复设置页白屏");
		expect(page.content).toContain("MERGED");
		expect(page.content).toContain("@carol");
		expect(page.content).toContain("fix/settings");
		expect(page.content).toContain("把 null 判断补上。");
	});

	it("pull /files：diff 代码块", () => {
		const page = renderTarget(pullFiles, ["diff --git a/x b/x\n+line"], MAX);

		expect(page.content).toContain("```diff");
		expect(page.content).toContain("+line");
	});

	it("release：tag / 作者 / 正文", () => {
		const page = renderTarget(release, [JSON.stringify(RELEASE)], MAX);

		expect(page.title).toBe("v0.2.0");
		expect(page.content).toContain("v0.2.0");
		expect(page.content).toContain("@dave");
		expect(page.content).toContain("修复若干问题");
	});
});

describe("truncateText", () => {
	it("不超限时原样返回", () => {
		expect(truncateText("hello", 100)).toEqual({ content: "hello", truncated: false });
	});

	it("超限时截断并附原文长度", () => {
		const text = "x".repeat(500);
		const page = truncateText(text, 100);

		expect(page.truncated).toBe(true);
		expect(page.content.startsWith("x".repeat(100))).toBe(true);
		expect(page.content).toContain("[... truncated:");
		expect(page.content).toContain("500");
	});
});

describe("renderTarget 超 maxChars", () => {
	it("按 maxChars 截断并标记", () => {
		const page = renderTarget(issue, [JSON.stringify(ISSUE)], 120);

		expect(page.truncated).toBe(true);
		expect(page.content).toContain("[... truncated:");
	});
});
