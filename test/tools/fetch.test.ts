import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExtractorId } from "../../config/index.ts";
import type { ExtractedContent, Extractor } from "../../extractors/index.ts";
import { resetGhProbeCache } from "../../handlers/github/gh.ts";
import type { GhExecutor } from "../../handlers/index.ts";
import { createFetchTool, executeFetch } from "../../tools/fetch.ts";
import { ISSUE } from "../handlers/fixtures.ts";
import { fakeHttp, firstText, makeConfig, rejectionOf } from "./fixtures.ts";

const spilled: string[] = [];
afterEach(() => {
	for (const path of spilled.splice(0)) rmSync(dirname(path), { recursive: true, force: true });
});

beforeEach(() => resetGhProbeCache());

const okExec: GhExecutor = async (_command, args) => {
	if (args[0] === "--version") return { ok: true, stdout: "gh version 2.60.0", stderr: "" };
	if (args[0] === "auth") return { ok: true, stdout: "Logged in", stderr: "" };
	return { ok: true, stdout: JSON.stringify(ISSUE), stderr: "" };
};

const missingExec: GhExecutor = async (command) => ({
	ok: false,
	stdout: "",
	stderr: "",
	error: `spawn ${command} ENOENT`,
});

/** 计数用的提取器表；内容必须长于默认 minChars(200)，否则链会继续下一个。 */
function countingExtractors() {
	let calls = 0;
	const make = (id: ExtractorId): Extractor => ({
		id,
		unavailableReason: () => null,
		async extract(url): Promise<ExtractedContent> {
			calls += 1;
			return { url, title: `${id} 标题`, content: "提取正文".repeat(60) };
		},
	});
	return { extractors: { tavily: make("tavily"), exa: make("exa"), html: make("html") }, calls: () => calls };
}

describe("executeFetch：handler 与提取器链", () => {
	it("按提取器链抓取正文并标注来源", async () => {
		const http = fakeHttp(() => ({ text: `<html><head><title>页面标题</title></head><body><p>${"正文段落内容".repeat(40)}</p></body></html>` }));

		const result = await executeFetch(makeConfig(), { url: "https://example.com/page" }, undefined, { http });

		expect(result.details.source).toBe("html");
		expect(result.details.mode).toBe("extract");
		expect(result.details.title).toBe("页面标题");
		expect(firstText(result)).toContain("正文段落内容");
		expect(http.calls).toHaveLength(1);
	});

	it("命中 handler 时提取器链与 HTTP 都不被调用", async () => {
		const counted = countingExtractors();
		const http = fakeHttp(() => ({ text: "不该被请求" }));

		const result = await executeFetch(makeConfig(), { url: "https://github.com/o/r/issues/7" }, undefined, {
			http,
			execGh: okExec,
			extractors: counted.extractors,
		});

		expect(result.details.source).toBe("github");
		expect(result.details.handlerSkips).toEqual([]);
		expect(counted.calls()).toBe(0);
		expect(http.calls).toEqual([]);
	});

	it("handler 跳过时注明原因并顺延到链", async () => {
		const http = fakeHttp(() => ({ text: `<html><title>GH 页面</title><body>${"回退正文".repeat(60)}</body></html>` }));

		const result = await executeFetch(makeConfig(), { url: "https://github.com/o/r/issues/7" }, undefined, { http, execGh: missingExec });

		expect(result.details.source).toBe("html");
		expect(result.details.handlerSkips?.[0]).toContain("未找到可用的 gh");
		expect(firstText(result)).toContain("未接管");
		expect(firstText(result)).toContain("回退正文");
		expect(http.calls).toHaveLength(1);
	});
});

describe("executeFetch：raw 与安全", () => {
	it("raw: true 时 handler 与提取器链都不被调用", async () => {
		const counted = countingExtractors();
		let ghCalls = 0;
		const execGh: GhExecutor = async () => {
			ghCalls += 1;
			return { ok: false, stdout: "", stderr: "", error: "spawn gh ENOENT" };
		};
		const http = fakeHttp(() => ({ text: "RAW <b>BODY</b>", contentType: "text/plain" }));

		const result = await executeFetch(makeConfig(), { url: "https://example.com/raw", raw: true }, undefined, {
			http,
			execGh,
			extractors: counted.extractors,
		});

		expect(firstText(result)).toContain("RAW <b>BODY</b>");
		expect(result.details.mode).toBe("raw");
		expect(result.details.source).toBe("raw");
		expect(ghCalls).toBe(0);
		expect(counted.calls()).toBe(0);
		expect(http.calls).toHaveLength(1);
	});

	it("fetch.allowRaw 为 false 时 raw 抛错并指明配置键", async () => {
		const http = fakeHttp(() => ({ text: "raw" }));

		const error = await rejectionOf(
			executeFetch(makeConfig({ fetch: { allowRaw: false } }), { url: "https://example.com/x", raw: true }, undefined, { http }),
		);

		expect(error.message).toContain("fetch.allowRaw");
		expect(http.calls).toEqual([]);
	});

	it("内网 URL 被拒且不发请求", async () => {
		const http = fakeHttp(() => ({ text: "不该被请求" }));

		const error = await rejectionOf(executeFetch(makeConfig(), { url: "http://127.0.0.1:8080/x" }, undefined, { http }));

		expect(error.message).toMatch(/私有|回环|link-local/);
		expect(http.calls).toEqual([]);
	});

	it("raw 是否进 schema 由 fetch.allowRaw 决定", () => {
		const properties = (tool: { parameters: unknown }) => Object.keys((tool.parameters as { properties: object }).properties);

		expect(properties(createFetchTool(makeConfig()))).toContain("raw");
		expect(properties(createFetchTool(makeConfig({ fetch: { allowRaw: false } })))).not.toContain("raw");
	});

	it("工具名取 config.tools.web_fetch.name", () => {
		const tool = createFetchTool(makeConfig({ tools: { web_fetch: { enabled: true, name: "fetch_page" } } }));

		expect(tool.name).toBe("fetch_page");
	});
});

describe("executeFetch：截断与失败", () => {
	it("超 context 上限时截断并写临时文件", async () => {
		const http = fakeHttp(() => ({ text: `<html><title>长页</title><body>${"长正文".repeat(3_000)}</body></html>` }));

		const result = await executeFetch(makeConfig({ context: { maxInlineChars: 4_000, maxInlineLines: 100, spillToFile: true } }), {
			url: "https://example.com/long",
		}, undefined, { http });
		const path = result.details.fullOutputPath;
		if (path) spilled.push(path);

		expect(result.details.truncated).toBe(true);
		expect(path).toBeTruthy();
		expect(firstText(result)).toContain("已截断");
		// visibleChars 反映截断后的可见量，避免 chars（截断前）让模型误以为「已拿全」
		expect(result.details.visibleChars).toBe(firstText(result).length);
		expect(result.details.visibleChars).toBeLessThan(result.details.chars);
		expect(existsSync(path ?? "")).toBe(true);
		expect(readFileSync(path ?? "", "utf-8")).toContain("长正文");
	});

	it("全部提取器失败时抛错并汇总原因", async () => {
		const http = fakeHttp(() => ({ text: "<html><body>太短</body></html>" }));

		const error = await rejectionOf(executeFetch(makeConfig(), { url: "https://example.com/short" }, undefined, { http }));

		expect(error.message).toContain("所有提取器");
		expect(error.message).toContain("tavily");
		expect(error.message).toContain("TAVILY_API_KEY");
		expect(error.message).toContain("html");
		expect(error.message).toContain("内容过短");
	});
});
