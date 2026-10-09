/** web_search 工具：provider 四层解析、max_results clamp、统一结果信封与截断。 */

import { Type, type Static } from "typebox";
import { PROVIDER_IDS, type ProviderId, type ResolvedConfig } from "../config/index.ts";
import { createHttpClient, type HttpClient } from "../http/index.ts";
import { createSearchProvider, resolveApiKey, resolveProviderId, type SearchProvider, type SearchResult } from "../providers/index.ts";
import { buildToolResult, finalizeContent, type AgentToolResult, type ToolDefinition } from "./result.ts";
import { renderSearchCall, renderSearchResult } from "./render.ts";

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

	const header = `web_search: ${results.length} results (provider: ${providerId}, max_results: ${maxResults})`;
	const body =
		results.length === 0
			? "No results returned."
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
	{ description: `Provider override; valid values: ${PROVIDER_IDS.join(", ")}` },
);

/** 未配置 guidance.promptSnippet 时的默认一行短语（工具列表用）。 */
const DEFAULT_PROMPT_SNIPPET = "Search the web";

/** schema 独立成函数：返回类型要用 `Static<typeof ...>`，函数签名引用不到函数体内的变量。 */
function buildParameters(config: ResolvedConfig) {
	return Type.Object({
		query: Type.String({ description: "Search query" }),
		max_results: Type.Optional(
			Type.Integer({
				description: `Number of results, clamped to 1-${config.search.maxResultsLimit}; default ${config.search.defaultMaxResults}`,
			}),
		),
		provider: Type.Optional(PROVIDER_SCHEMA),
	});
}

type SearchParameters = ReturnType<typeof buildParameters>;

export function createSearchTool(
	config: ResolvedConfig,
	overrides: SearchOverrides = {},
): ToolDefinition<SearchParameters, SearchDetails> {
	const parameters = buildParameters(config);
	const guidance = config.guidance.web_search ?? {};
	// 默认 guidelines 前缀取配置的工具名，改名后提示词仍指向真实工具；description 保持英文（tool_search 的 BM25 只索引 a-z0-9）
	const toolName = config.tools.web_search.name;
	const guidanceFields = {
		promptSnippet: guidance.promptSnippet ?? DEFAULT_PROMPT_SNIPPET,
		promptGuidelines: guidance.promptGuidelines ?? [
			`${toolName}: use for info beyond training data (recent events, fact-checking, live docs).`,
			`${toolName}: cite sources as "Sources:" with [Title](URL) links.`,
		],
	};

	return {
		name: toolName,
		label: "Web Search",
		description: guidance.description ?? "Search the web; returns titles, URLs and snippets.",
		parameters,
		...guidanceFields,
		renderCall: renderSearchCall,
		renderResult: renderSearchResult,
		async execute(_toolCallId, params: Static<typeof parameters>, signal) {
			return executeSearch(config, params, signal, overrides);
		},
	};
}
