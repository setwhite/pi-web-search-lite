/** tools/render.ts：两个工具的调用行 / 结果行渲染（折叠、展开、partial、失败回退）。只影响 TUI，不改模型上下文。 */

import { describe, expect, it } from "vitest";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import type { AgentToolResult, Theme } from "../../tools/result.ts";
import type { SearchDetails } from "../../tools/search.ts";
import type { FetchDetails } from "../../tools/fetch.ts";
import { renderFetchCall, renderFetchResult, renderSearchCall, renderSearchResult } from "../../tools/render.ts";
import { createFetchTool } from "../../tools/fetch.ts";
import { createSearchTool } from "../../tools/search.ts";
import { makeConfig } from "./fixtures.ts";

type RenderTheme = Pick<Theme, "fg" | "bold">;

interface FgCall {
	color: ThemeColor;
	text: string;
}

/** fg 原样返回文本并记录 (color, text)，便于同时断言文案与语义色。 */
function makeTheme(): { theme: RenderTheme; calls: FgCall[] } {
	const calls: FgCall[] = [];
	return {
		theme: {
			fg(color, text) {
				calls.push({ color, text });
				return text;
			},
			bold: (text) => text,
		},
		calls,
	};
}

/** Text.render 会把每行右填充到 width，断言前逐行去尾部空格。 */
const line = (component: { render(width: number): string[] }): string =>
	component
		.render(80)
		.map((textLine) => textLine.trimEnd())
		.join("\n");

function searchDetails(overrides: Partial<SearchDetails> = {}): SearchDetails {
	return {
		provider: "tavily",
		query: "pi",
		count: 2,
		results: [
			{ title: "结果甲", url: "https://example.com/a", snippet: "摘要甲" },
			{ title: "结果乙", url: "https://example.com/b", snippet: "" },
		],
		truncated: false,
		...overrides,
	};
}

function fetchDetails(overrides: Partial<FetchDetails> = {}): FetchDetails {
	return {
		url: "https://example.com/",
		title: "Example Domain",
		source: "html",
		mode: "extract",
		chars: 120,
		visibleChars: 120,
		truncated: false,
		handlerSkips: [],
		...overrides,
	};
}

/** 失败结果与宿主一致：details 为空对象、错误全文在 content（pi-agent-core 的 createErrorToolResult）。 */
function failure(text: string): AgentToolResult<never> {
	return { content: [{ type: "text", text }], details: {} as never };
}

describe("renderSearchCall", () => {
	it("显示加粗标题、查询词，显式 provider 才有 via", () => {
		const { theme, calls } = makeTheme();

		const plain = line(renderSearchCall({ query: "pi coding agent", max_results: 5 }, theme));
		expect(plain).toBe('Web Search "pi coding agent"');
		expect(calls[0]).toEqual({ color: "toolTitle", text: "Web Search " });

		const withProvider = line(renderSearchCall({ query: "pi", provider: "exa" }, theme));
		expect(withProvider).toBe('Web Search "pi" via exa');
	});

	it("流式参数（args 为空对象）不抛错", () => {
		const { theme } = makeTheme();
		expect(() => line(renderSearchCall({} as never, theme))).not.toThrow();
	});
});

describe("renderSearchResult", () => {
	it("折叠：成功行给条数与 provider，展开才列出标题", () => {
		const { theme, calls } = makeTheme();
		const result: AgentToolResult<SearchDetails> = { content: [], details: searchDetails() };

		const collapsed = line(renderSearchResult(result, { expanded: false, isPartial: false }, theme));
		expect(collapsed).toBe("✓ 2 results (tavily)");
		expect(collapsed).not.toContain("结果甲");
		expect(calls[0]).toEqual({ color: "success", text: "✓ 2 results" });

		const expanded = line(renderSearchResult(result, { expanded: true, isPartial: false }, theme));
		expect(expanded).toContain("• 结果甲");
		expect(expanded).toContain("• 结果乙");
	});

	it("展开超过 5 条时截断并给剩余条数", () => {
		const { theme } = makeTheme();
		const results = Array.from({ length: 7 }, (_, index) => ({
			title: `t${index}`,
			url: `https://example.com/${index}`,
			snippet: "",
		}));
		const result: AgentToolResult<SearchDetails> = { content: [], details: searchDetails({ results, count: 7 }) };

		const text = line(renderSearchResult(result, { expanded: true, isPartial: false }, theme));
		expect(text).toContain("• t4");
		expect(text).not.toContain("• t5");
		expect(text).toContain("… 2 more");
	});

	it("截断时给标记", () => {
		const { theme } = makeTheme();
		const result: AgentToolResult<SearchDetails> = { content: [], details: searchDetails({ truncated: true }) };

		expect(line(renderSearchResult(result, { expanded: false, isPartial: false }, theme))).toContain(" (truncated)");
	});

	it("执行中显示进行中状态", () => {
		const { theme, calls } = makeTheme();
		const text = line(renderSearchResult({ content: [], details: searchDetails() }, { expanded: false, isPartial: true }, theme));

		expect(text).toBe("Searching…");
		expect(calls[0]?.color).toBe("warning");
	});

	it("失败：details 为空对象时显示 ✗ 与错误首行，展开补全，绝不出现 ✓", () => {
		const { theme, calls } = makeTheme();
		const message = 'provider "tavily" is missing an API key: set the TAVILY_API_KEY env var.\nSecond line detail';

		const collapsed = line(renderSearchResult(failure(message), { expanded: false, isPartial: false }, theme));
		expect(collapsed).toContain('✗ provider "tavily" is missing an API key: set the TAVILY_API_KEY env var.');
		expect(collapsed).not.toContain("✓");
		expect(collapsed).not.toContain("Second line detail");
		expect(calls[0]?.color).toBe("error");

		const expanded = line(renderSearchResult(failure(message), { expanded: true, isPartial: false }, theme));
		expect(expanded).toContain("Second line detail");
	});

	it("失败且无错误文本时不抛错，给兜底文案", () => {
		const { theme } = makeTheme();
		// 非宿主形状的防御用例：details 缺失（宿主抛错时给 {}，不会给 undefined）
		const empty: AgentToolResult<unknown> = { content: [], details: undefined };

		expect(line(renderSearchResult(empty as AgentToolResult<SearchDetails>, { expanded: false, isPartial: false }, theme))).toContain("✗");
	});
});

describe("renderFetchCall", () => {
	it("显示 URL，空参数不抛错", () => {
		const { theme } = makeTheme();

		expect(line(renderFetchCall({ url: "https://example.com/" }, theme))).toBe("Web Fetch https://example.com/");
		expect(() => line(renderFetchCall({} as never, theme))).not.toThrow();
	});
});

describe("renderFetchResult", () => {
	it("折叠：成功行给标题；展开才预览正文前 15 行", () => {
		const { theme, calls } = makeTheme();
		const body = Array.from({ length: 20 }, (_, index) => `第${index}行`).join("\n");
		const result: AgentToolResult<FetchDetails> = {
			content: [{ type: "text", text: body }],
			details: fetchDetails(),
		};

		const collapsed = line(renderFetchResult(result, { expanded: false, isPartial: false }, theme));
		expect(collapsed).toBe("✓ Fetched: Example Domain");
		expect(collapsed).not.toContain("第0行");
		expect(calls[0]).toEqual({ color: "success", text: "✓ Fetched: " });

		const expanded = line(renderFetchResult(result, { expanded: true, isPartial: false }, theme));
		expect(expanded).toContain("第0行");
		expect(expanded).toContain("第14行");
		expect(expanded).not.toContain("第15行");
		expect(expanded).toContain("… 5 more lines");
	});

	it("内容不超过预览上限时不显示省略行", () => {
		const { theme } = makeTheme();
		const result: AgentToolResult<FetchDetails> = { content: [{ type: "text", text: "一行" }], details: fetchDetails() };

		const text = line(renderFetchResult(result, { expanded: true, isPartial: false }, theme));
		expect(text).not.toContain("more lines");
	});

	it("截断时给标记", () => {
		const { theme } = makeTheme();
		const result: AgentToolResult<FetchDetails> = { content: [], details: fetchDetails({ truncated: true }) };

		expect(line(renderFetchResult(result, { expanded: false, isPartial: false }, theme))).toContain(" (truncated)");
	});

	it("执行中显示进行中状态", () => {
		const { theme, calls } = makeTheme();
		const text = line(renderFetchResult({ content: [], details: fetchDetails() }, { expanded: false, isPartial: true }, theme));

		expect(text).toBe("Fetching…");
		expect(calls[0]?.color).toBe("warning");
	});

	it("失败：显示 ✗ 与错误首行，绝不出现 ✓", () => {
		const { theme } = makeTheme();
		const message = "all extractors failed to produce usable content (3 tried):\n- html: failed (network error)";
		const text = line(renderFetchResult(failure(message), { expanded: false, isPartial: false }, theme));

		expect(text).toContain("✗ all extractors failed to produce usable content (3 tried):");
		expect(text).not.toContain("✓");
		expect(text).not.toContain("- html: failed (network error)");
	});
});

describe("失败判定：宿主真实形状", () => {
	it("两个工具遇到 details: {} 都走失败分支，不显示 ✓", () => {
		const { theme } = makeTheme();
		// 宿主 createErrorToolResult 产出的形状：details 为空对象，错误全文在 content
		const result = { content: [{ type: "text" as const, text: "boom" }], details: {} };

		const search = line(renderSearchResult(result as AgentToolResult<SearchDetails>, { expanded: false, isPartial: false }, theme));
		const fetchResult = line(renderFetchResult(result as AgentToolResult<FetchDetails>, { expanded: false, isPartial: false }, theme));

		expect(search).toBe("✗ boom");
		expect(fetchResult).toBe("✗ boom");
	});
});

describe("工具定义接线", () => {
	it("两个工具都挂上与 render.ts 同一份 renderCall / renderResult", () => {
		const search = createSearchTool(makeConfig());
		const fetchTool = createFetchTool(makeConfig());

		expect(search.renderCall).toBe(renderSearchCall);
		expect(search.renderResult).toBe(renderSearchResult);
		expect(fetchTool.renderCall).toBe(renderFetchCall);
		expect(fetchTool.renderResult).toBe(renderFetchResult);
	});
});
