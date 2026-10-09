/** web_search 工具：provider 四层解析、max_results clamp、统一结果信封与截断。 */

import { Type, type Static } from "typebox";
import { PROVIDER_IDS, type ProviderId, type ResolvedConfig } from "../config/index.ts";
import { createHttpClient, type HttpClient } from "../http/index.ts";
import { createSearchProvider, resolveApiKey, resolveProviderId, type SearchProvider, type SearchResult } from "../providers/index.ts";
import { buildToolResult, finalizeContent, type AgentToolResult, type ToolDefinition } from "./result.ts";

export interface SearchParams {
	query: string;
	max_results?: number;
	provider?: string;
}

export interface SearchOverrides {
	http?: HttpClient;
	/** 测试注入；缺省按 providerId 构造。 */
	provider?: SearchProvider;
}

export interface SearchDetails {
	provider: ProviderId;
	query: string;
	count: number;
	results: SearchResult[];
	truncated: boolean;
	fullOutputPath?: string;
}

/** clamp 到 1–search.maxResultsLimit；缺省或非法值退回 search.defaultMaxResults。 */
export function clampMaxResults(requested: number | undefined, config: ResolvedConfig): number {
	const value = Number.isFinite(requested) ? Math.trunc(requested as number) : config.search.defaultMaxResults;
	return Math.min(Math.max(1, value), config.search.maxResultsLimit);
}

export async function executeSearch(
	config: ResolvedConfig,
	params: SearchParams,
	signal: AbortSignal | undefined,
	overrides: SearchOverrides = {},
): Promise<AgentToolResult<SearchDetails>> {
	const providerId = resolveProviderId(params.provider, config.provider);
	const apiKey = resolveApiKey(providerId, config.apiKeys);
	const http = overrides.http ?? createHttpClient({ proxy: config.proxy, timeoutMs: config.timeoutMs, userAgent: config.userAgent });
	const provider = overrides.provider ?? createSearchProvider(providerId, { http, apiKey });
	const maxResults = clampMaxResults(params.max_results, config);

	const results = await provider.search({ query: params.query, maxResults, signal });

	const header = `web_search（provider: ${providerId}，max_results: ${maxResults}，共 ${results.length} 条）`;
	const body =
		results.length === 0
			? "未返回结果。"
			: results
					.map((item, index) =>
						[`${index + 1}. ${item.title}`, `   ${item.url}`, ...(item.snippet ? [`   ${item.snippet}`] : [])].join("\n"),
					)
					.join("\n\n");

	const envelope = await finalizeContent(`${header}\n\n${body}`, { ...config.context, fileName: "web-search.md" });
	return buildToolResult(envelope.content, {
		provider: providerId,
		query: params.query,
		count: results.length,
		results,
		truncated: envelope.truncated,
		...(envelope.fullOutputPath ? { fullOutputPath: envelope.fullOutputPath } : {}),
	});
}

const PROVIDER_SCHEMA = Type.Union(
	PROVIDER_IDS.map((id) => Type.Literal(id)),
	{ description: `覆盖 provider；合法值：${PROVIDER_IDS.join("、")}` },
);

/** 未配置 guidance.promptSnippet 时的默认一行短语（工具列表用）。 */
const DEFAULT_PROMPT_SNIPPET = "搜索网页（Tavily / Brave / Exa，需显式选 provider）";

export function createSearchTool(config: ResolvedConfig, overrides: SearchOverrides = {}): ToolDefinition {
	const parameters = Type.Object({
		query: Type.String({ description: "搜索关键词" }),
		max_results: Type.Optional(
			Type.Integer({
				description: `返回结果数，clamp 到 1–${config.search.maxResultsLimit}；缺省 ${config.search.defaultMaxResults}`,
			}),
		),
		provider: Type.Optional(PROVIDER_SCHEMA),
	});
	const guidance = config.guidance.web_search ?? {};
	const guidanceFields = {
		promptSnippet: guidance.promptSnippet ?? DEFAULT_PROMPT_SNIPPET,
		...(guidance.promptGuidelines ? { promptGuidelines: guidance.promptGuidelines } : {}),
	};

	return {
		name: config.tools.web_search.name,
		label: "Web Search",
		description:
			guidance.description ??
			[
				"通过 Tavily / Brave / Exa 之一搜索网页，返回标题 / URL / 摘要。",
				`provider 解析顺序：provider 参数 > WEB_SEARCH_PROVIDER 环境变量 > config.provider > tavily；缺 key 会直接报错，不会自动换 provider。`,
				`max_results 会 clamp 到 1–${config.search.maxResultsLimit}（缺省 ${config.search.defaultMaxResults}）。`,
				"结果超 context 上限时自动截断；被截断时完整内容写入临时文件，结果里会给出绝对路径，可用 read 工具继续读取。",
			].join("\n"),
		parameters,
		...guidanceFields,
		async execute(_toolCallId, params: Static<typeof parameters>, signal) {
			return executeSearch(config, params, signal, overrides);
		},
	};
}
