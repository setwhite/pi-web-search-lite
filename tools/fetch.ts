/** web_fetch 工具：SSRF 检查 → GitHub handler → 提取器链（或 raw 直取），统一来源标注与截断。 */

import { Type, type TSchema } from "typebox";
import type { ExtractorId, ResolvedConfig } from "../config/index.ts";
import { extractWithChain, type Extractor, type ExtractedPage } from "../extractors/index.ts";
import { runPageHandlers, type GhExecutor } from "../handlers/index.ts";
import { createHttpClient, type HttpClient } from "../http/index.ts";
import { assertPublicUrl } from "../ssrf/index.ts";
import { buildToolResult, finalizeContent, type AgentToolResult, type ToolDefinition } from "./result.ts";
import { renderFetchCall, renderFetchResult } from "./render.ts";

export interface FetchParams {
	url: string;
	raw?: boolean;
}

export interface FetchOverrides {
	http?: HttpClient;
	/** 测试注入；缺省真跑 gh。 */
	execGh?: GhExecutor;
	/** 测试注入；缺省用内置 EXTRACTORS。 */
	extractors?: Record<ExtractorId, Extractor>;
}

export type FetchSource = "github" | ExtractorId | "raw";

export interface FetchDetails {
	url: string;
	title: string;
	source: FetchSource;
	mode: "extract" | "raw";
	/** 提取正文的字符数（截断前）。 */
	chars: number;
	/** 模型实际收到的 content 字符数（截断后，含头部与截断提示）；与 `chars` 不等时说明已截断。 */
	visibleChars: number;
	truncated: boolean;
	fullOutputPath?: string;
	/** handler 命中但未接管时的原因（透明顺延，不是静默降级）。 */
	handlerSkips: string[];
}

export async function executeFetch(
	config: ResolvedConfig,
	params: FetchParams,
	signal: AbortSignal | undefined,
	overrides: FetchOverrides = {},
): Promise<AgentToolResult<FetchDetails>> {
	const target = assertPublicUrl(params.url);
	const http = overrides.http ?? createHttpClient({ proxy: config.proxy, timeoutMs: config.timeoutMs, userAgent: config.userAgent });
	const maxCharsPerPage = config.fetch.maxCharsPerPage;

	if (params.raw === true) {
		if (!config.fetch.allowRaw) {
			throw new Error("raw mode is disabled: set fetch.allowRaw to true in the config file, or omit the raw argument.");
		}
		const response = await http.fetchText(target.toString(), { signal });
		const text = `Raw content (${response.contentType ?? "unknown type"}, ${response.text.length} chars)\nSource: ${response.url}\n\n${response.text}`;
		const envelope = await finalizeContent(text, { ...config.context, fileName: "web-fetch.md" });
		return buildToolResult(envelope.content, {
			url: response.url,
			title: response.url,
			source: "raw",
			mode: "raw",
			chars: response.text.length,
			visibleChars: envelope.content.length,
			truncated: envelope.truncated,
			handlerSkips: [],
			...(envelope.fullOutputPath ? { fullOutputPath: envelope.fullOutputPath } : {}),
		});
	}

	const handlerRun = await runPageHandlers(target, {
		github: config.handlers.github,
		proxy: config.proxy,
		signal,
		execGh: overrides.execGh,
	});
	const handlerSkips = handlerRun.skips.map((skip) => `${skip.handler} handler skipped: ${skip.reason}`);

	let page: { url: string; title: string; content: string; source: FetchSource; truncated: boolean };
	if (handlerRun.result) {
		page = {
			url: handlerRun.result.url,
			title: handlerRun.result.title,
			content: handlerRun.result.content,
			source: handlerRun.result.handler as FetchSource,
			truncated: handlerRun.result.truncated,
		};
	} else {
		const extracted: ExtractedPage = await extractWithChain(
			target.toString(),
			config.fetch.extractors,
			{
				http,
				apiKeys: config.apiKeys,
				minChars: config.fetch.minChars,
				maxCharsPerPage,
				signal,
			},
			overrides.extractors,
		);
		page = {
			url: extracted.url,
			title: extracted.title ?? extracted.url,
			content: extracted.content,
			source: extracted.extractor,
			truncated: extracted.truncated,
		};
	}

	const header = [
		`# ${page.title}`,
		`Source: ${page.url}`,
		`Extracted by: ${page.source === "github" ? "GitHub handler" : `extractor ${page.source}`}`,
		...(handlerSkips.length > 0 ? ["", ...handlerSkips.map((line) => `> ${line}`)] : []),
	].join("\n");

	const envelope = await finalizeContent(`${header}\n\n${page.content}`, { ...config.context, fileName: "web-fetch.md" });
	return buildToolResult(envelope.content, {
		url: page.url,
		title: page.title,
		source: page.source,
		mode: "extract",
		chars: page.content.length,
		visibleChars: envelope.content.length,
		truncated: page.truncated || envelope.truncated,
		handlerSkips,
		...(envelope.fullOutputPath ? { fullOutputPath: envelope.fullOutputPath } : {}),
	});
}

/** 未配置 guidance.promptSnippet 时的默认一行短语（工具列表用）。 */
const DEFAULT_PROMPT_SNIPPET = "Extract URL text";

export function createFetchTool(config: ResolvedConfig, overrides: FetchOverrides = {}): ToolDefinition<TSchema, FetchDetails> {
	const properties: Record<string, TSchema> = {
		url: Type.String({ description: "http(s) URL to fetch; private and loopback addresses are rejected" }),
	};
	if (config.fetch.allowRaw) {
		properties.raw = Type.Boolean({ description: "true = return the raw response body, skipping the GitHub handler and the extractor chain" });
	}
	const guidance = config.guidance.web_fetch ?? {};
	// 默认 guidelines 前缀与跨工具引用都取配置的工具名，改名后不失效；description 保持英文
	const toolName = config.tools.web_fetch.name;
	const searchToolName = config.tools.web_search.name;
	const guidanceFields = {
		promptSnippet: guidance.promptSnippet ?? DEFAULT_PROMPT_SNIPPET,
		promptGuidelines: guidance.promptGuidelines ?? [
			`${toolName}: use to get full text of a URL, e.g. docs or URLs found by ${searchToolName}.`,
		],
	};

	return {
		name: toolName,
		label: "Web Fetch",
		description: guidance.description ?? "Extract content of URL.",
		parameters: Type.Object(properties),
		...guidanceFields,
		renderCall: renderFetchCall,
		renderResult: renderFetchResult,
		async execute(_toolCallId, params, signal) {
			return executeFetch(config, params as FetchParams, signal, overrides);
		},
	};
}
