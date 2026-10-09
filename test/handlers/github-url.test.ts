import { describe, expect, it } from "vitest";
import { parseGitHubUrl } from "../../handlers/github/index.ts";

function parse(url: string) {
	return parseGitHubUrl(new URL(url));
}

describe("parseGitHubUrl 命中六类页面", () => {
	it("仓库首页", () => {
		expect(parse("https://github.com/o/r")).toEqual({ kind: "repo", owner: "o", repo: "r" });
	});

	it("blob：ref + path", () => {
		expect(parse("https://github.com/o/r/blob/main/src/a.ts")).toEqual({
			kind: "blob",
			owner: "o",
			repo: "r",
			ref: "main",
			path: "src/a.ts",
		});
	});

	it("tree：根与子目录", () => {
		expect(parse("https://github.com/o/r/tree/main")).toEqual({ kind: "tree", owner: "o", repo: "r", ref: "main", path: "" });
		expect(parse("https://github.com/o/r/tree/main/src")).toEqual({ kind: "tree", owner: "o", repo: "r", ref: "main", path: "src" });
	});

	it("issue", () => {
		expect(parse("https://github.com/o/r/issues/7")).toEqual({ kind: "issue", owner: "o", repo: "r", number: 7 });
	});

	it("pull：普通与 /files", () => {
		expect(parse("https://github.com/o/r/pull/12")).toEqual({ kind: "pull", owner: "o", repo: "r", number: 12, files: false });
		expect(parse("https://github.com/o/r/pull/12/files")).toEqual({ kind: "pull", owner: "o", repo: "r", number: 12, files: true });
	});

	it("release tag", () => {
		expect(parse("https://github.com/o/r/releases/tag/v0.2.0")).toEqual({ kind: "release", owner: "o", repo: "r", tag: "v0.2.0" });
	});

	it("query 与锚点被忽略，仍命中", () => {
		expect(parse("https://github.com/o/r/issues/7?foo=1#issuecomment-9")).toMatchObject({ kind: "issue", number: 7 });
		expect(parse("https://github.com/o/r/blob/main/README.md?plain=1#L3")).toMatchObject({ kind: "blob", path: "README.md" });
	});

	it("www.github.com 与 .git 后缀", () => {
		expect(parse("https://www.github.com/o/r.git")).toEqual({ kind: "repo", owner: "o", repo: "r" });
	});
});

describe("parseGitHubUrl 不命中", () => {
	it.each([
		"https://gist.github.com/o/abc123",
		"https://github.com/o/r/wiki",
		"https://github.com/o/r/actions",
		"https://github.com/o/r/discussions/3",
		"https://github.com/o/r/settings",
		"https://example.com/o/r",
		"https://github.com/o",
		"https://github.com/o/r/tree",
		"https://github.com/o/r/blob/main",
		"https://github.com/o/r/issues/abc",
		"https://github.com/o/r/issues/7/comment",
		"https://github.com/o/r/pull/12/commits",
		"https://github.com/o/r/releases/latest",
		"https://github.com/orgs/foo",
		"https://github.com/-bad/r",
		"https://github.com/o/.r",
	])("%s", (url) => {
		expect(parseGitHubUrl(new URL(url))).toBeNull();
	});
});
