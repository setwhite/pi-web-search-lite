/** web_fetch 工具：SSRF 检查 → GitHub handler → 提取器链（或 raw 直取），统一来源标注与截断。 */

import { Type, type TSchema } from "typebox";
import type { ExtractorId, ResolvedConfig } from "../config/index.ts";
import { extractWithChain, type Extractor, type ExtractedPage } from "../extractors/index.ts";
import { runPageHandlers, type GhExecutor } from "../handlers/index.ts";
import { createHttpClient, type HttpClient } from "../http/index.ts";
import { assertPublicUrl } from "../ssrf/index.ts";
import { buildToolResult, finalizeContent, type AgentToolResult, type ToolDefinition } from "./result.ts";

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
			throw new Error("raw 模式未启用：请把配置文件的 fetch.allowRaw 设为 true，或不传 raw 参数。");
		}
		const response = await http.fetchText(target.toString(), { signal });
		const text = `原始内容（${response.contentType ?? "未知类型"}，${response.text.length} 字符）\n来源：${response.url}\n\n${response.text}`;
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
	const handlerSkips = handlerRun.skips.map((skip) => `${skip.handler} handler 未接管：${skip.reason}`);

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
		`来源：${page.url}`,
		`提取方式：${page.source === "github" ? "GitHub handler" : `提取器 ${page.source}`}`,
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

export function createFetchTool(config: ResolvedConfig, overrides: FetchOverrides = {}): ToolDefinition<TSchema, FetchDetails> {
	const properties: Record<string, TSchema> = {
		url: Type.String({ description: "要抓取的 http(s) URL；内网 / 本机地址会被拒绝" }),
	};
	if (config.fetch.allowRaw) {
		properties.raw = Type.Boolean({ description: "true = 直接返回原始响应体，跳过 GitHub handler 与提取器链" });
	}
	const guidance = config.guidance.web_fetch ?? {};
	const guidanceFields = {
		...(guidance.promptSnippet ? { promptSnippet: guidance.promptSnippet } : {}),
		...(guidance.promptGuidelines ? { promptGuidelines: guidance.promptGuidelines } : {}),
	};

	return {
		name: config.tools.web_fetch.name,
		label: "Web Fetch",
		description:
			guidance.description ??
			[
				`抓取网页并提取正文：先试 GitHub 专用 handler（gh CLI），未命中或失败则按配置顺序尝试提取器 ${config.fetch.extractors.join(" → ")}。`,
				...(config.fetch.allowRaw ? ["raw: true 时直接返回原始响应体，跳过 handler 与提取器链。"] : []),
				"内容短于 fetch.minChars 或全部提取器失败会报错；handler 未接管时会在结果里注明原因并顺延。",
				"超 context 上限时自动截断；被截断时完整内容写入临时文件，结果里会给出绝对路径，可用 read 工具继续读取。",
			].join("\n"),
		parameters: Type.Object(properties),
		...guidanceFields,
		async execute(_toolCallId, params, signal) {
			return executeFetch(config, params as FetchParams, signal, overrides);
		},
	};
}
