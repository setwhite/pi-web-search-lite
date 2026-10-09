/**
 * 工具调用的 TUI 渲染：调用行与结果行（renderCall / renderResult）。
 * 唯一 import @earendil-works/pi-tui 的工具层文件；宿主 Theme / ToolRenderResultOptions 类型经 result.ts 转出。
 * 渲染只影响界面：不读网络、不改 details、不进模型上下文；宿主对渲染异常会回退到默认样式。
 * 界面文案统一用简短英文（TUI 惯例）；错误首行原样透传，语言跟工具层。
 */

import { Text } from "@earendil-works/pi-tui";
import type { AgentToolResult, Theme, ToolRenderResultOptions } from "./result.ts";
import type { SearchDetails, SearchParams } from "./search.ts";
import type { FetchDetails, FetchParams } from "./fetch.ts";

/** 只用到主题的 fg / bold；收窄后测试注入假 Theme 不必构造整个 Theme。 */
type RenderTheme = Pick<Theme, "fg" | "bold">;

/** 展开时的预览上限：搜索列条目、fetch 列正文行（参考 rpiv 的 5 / 15）。 */
const SEARCH_PREVIEW_LIMIT = 5;
const FETCH_PREVIEW_LINES = 15;

const PREVIEW_INDENT = "  ";
const TRUNCATED_MARK = " (truncated)";
const FAILURE_FALLBACK = "Tool failed (no error message)";

export function renderSearchCall(args: SearchParams, theme: RenderTheme): Text {
	let text = theme.fg("toolTitle", theme.bold("Web Search "));
	text += theme.fg("accent", `"${readString(args?.query)}"`);
	const provider = readString(args?.provider);
	if (provider) text += theme.fg("dim", ` via ${provider}`);
	return createText(text);
}

export function renderSearchResult(
	result: AgentToolResult<SearchDetails>,
	options: ToolRenderResultOptions,
	theme: RenderTheme,
): Text {
	if (options.isPartial) return createText(theme.fg("warning", "Searching…"));

	const details = result.details;
	// 宿主对抛错的工具生成 details = {} 的结果；不能只看类型，必须按形状判定
	if (typeof details?.count !== "number") return renderFailure(result, options, theme);

	let text = theme.fg("success", `✓ ${details.count} results`);
	text += theme.fg("muted", ` (${details.provider})`);
	if (details.truncated) text += theme.fg("warning", TRUNCATED_MARK);
	if (options.expanded) {
		const shown = details.results.slice(0, SEARCH_PREVIEW_LIMIT);
		for (const item of shown) text += `\n${PREVIEW_INDENT}${theme.fg("dim", `• ${item.title}`)}`;
		const rest = details.results.length - shown.length;
		if (rest > 0) text += `\n${PREVIEW_INDENT}${theme.fg("muted", `… ${rest} more`)}`;
	}
	return createText(text);
}

export function renderFetchCall(args: unknown, theme: RenderTheme): Text {
	// 流式工具调用期间宿主可能传入不完整参数（{} 或部分字段），一律按需读取
	const url = readString((args as Partial<FetchParams> | undefined)?.url);
	const text = theme.fg("toolTitle", theme.bold("Web Fetch ")) + theme.fg("accent", url);
	return createText(text);
}

export function renderFetchResult(
	result: AgentToolResult<FetchDetails>,
	options: ToolRenderResultOptions,
	theme: RenderTheme,
): Text {
	if (options.isPartial) return createText(theme.fg("warning", "Fetching…"));

	const details = result.details;
	if (typeof details?.url !== "string") return renderFailure(result, options, theme);

	let text = theme.fg("success", "✓ Fetched: ") + theme.fg("muted", details.title || details.url);
	if (details.truncated) text += theme.fg("warning", TRUNCATED_MARK);
	if (options.expanded) text += renderContentPreview(result, theme);
	return createText(text);
}

/** 失败结果：折叠只给 ✗ + 错误首行，展开给全文。 */
function renderFailure(result: AgentToolResult<unknown>, options: ToolRenderResultOptions, theme: RenderTheme): Text {
	const lines = firstText(result).split("\n");
	const shown = options.expanded ? lines : lines.slice(0, 1);
	const head = shown[0]?.trim() === "" || shown[0] === undefined ? FAILURE_FALLBACK : shown[0];

	let text = theme.fg("error", `✗ ${head}`);
	for (const line of shown.slice(1)) text += `\n${PREVIEW_INDENT}${theme.fg("error", line)}`;
	return createText(text);
}

function renderContentPreview(result: AgentToolResult<unknown>, theme: RenderTheme): string {
	const lines = firstText(result).split("\n");
	const shown = lines.slice(0, FETCH_PREVIEW_LINES);
	let text = "";
	for (const line of shown) text += `\n${PREVIEW_INDENT}${theme.fg("dim", line)}`;
	const rest = lines.length - shown.length;
	if (rest > 0) text += `\n${PREVIEW_INDENT}${theme.fg("muted", `… ${rest} more lines`)}`;
	return text;
}

function createText(text: string): Text {
	return new Text(text, 0, 0);
}

function firstText(result: AgentToolResult<unknown>): string {
	const block = result.content[0];
	return block?.type === "text" ? block.text : "";
}

function readString(value: unknown): string {
	return typeof value === "string" ? value : "";
}
