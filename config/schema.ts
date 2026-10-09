/**
 * 配置形状：公开常量、类型与默认值。
 * 版本号运行时读自 package.json；校验逻辑在 validate.ts。
 */

import { readFileSync } from "node:fs";

export const PROVIDER_IDS = ["tavily", "brave", "exa", "firecrawl", "perplexity"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const EXTRACTOR_IDS = ["tavily", "exa", "html", "firecrawl", "jina"] as const;
export type ExtractorId = (typeof EXTRACTOR_IDS)[number];

export const TOOL_IDS = ["web_search", "web_fetch"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const PACKAGE_NAME = "pi-web-search-lite";
/** 包版本：运行时读自 package.json，与发布版本唯一同源。 */
export const VERSION: string = readPackageVersion();

export const ENV_AGENT_DIR = "PI_CODING_AGENT_DIR";
export const CONFIG_SUBPATH = "pi-web-search-lite";
export const CONFIG_FILE_NAME = "config.json";

/**
 * 需要 API key 的 id：搜索源与 jina 提取器（jina 可无 key，配了就用）。
 * 缺 key 的语义不同：搜索源报错，提取器跳过。
 */
export const API_KEY_IDS = [...PROVIDER_IDS, "jina"] as const;
export type ApiKeyId = (typeof API_KEY_IDS)[number];

export const API_KEY_ENV_KEYS: Record<ApiKeyId, string> = {
	tavily: "TAVILY_API_KEY",
	brave: "BRAVE_API_KEY",
	exa: "EXA_API_KEY",
	firecrawl: "FIRECRAWL_API_KEY",
	perplexity: "PERPLEXITY_API_KEY",
	jina: "JINA_API_KEY",
};

/** 数值字段的 clamp 区间；越界取边界值而非报错。 */
export const RANGES = {
	timeoutMs: [1_000, 120_000],
	minChars: [0, 100_000],
	maxCharsPerPage: [1_000, 1_000_000],
	maxResultsLimit: [1, 20],
	handlerTimeoutMs: [1_000, 120_000],
	handlerMaxChars: [1_000, 1_000_000],
} as const satisfies Record<string, readonly [number, number]>;

export const MAX_INLINE_CHARS_MIN = 1_000;
export const MAX_INLINE_LINES_MIN = 50;

export const DEFAULT_USER_AGENT = `${PACKAGE_NAME}/${VERSION}`;
export const DEFAULT_PROVIDER: ProviderId = "tavily";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RESULTS = 5;
export const DEFAULT_MAX_RESULTS_LIMIT = 10;
export const DEFAULT_MIN_CHARS = 200;
export const DEFAULT_MAX_CHARS_PER_PAGE = 150_000;
/** 默认提取链只留免 key 的两位：本地 html 打头，抽不出东西再交给无 key 也能用的 jina；provider 提取器要显式配置。 */
export const DEFAULT_EXTRACTORS: ExtractorId[] = ["html", "jina"];
export const DEFAULT_HANDLER_COMMAND = "gh";
export const DEFAULT_HANDLER_TIMEOUT_MS = 30_000;
export const DEFAULT_HANDLER_MAX_CHARS = 150_000;

/** 工具名：字母开头，只含字母数字下划线连字符。 */
export const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
/** 宿主内置工具名，扩展工具不得占用。 */
export const RESERVED_TOOL_NAMES: ReadonlySet<string> = new Set([
	"bash",
	"edit",
	"find",
	"grep",
	"ls",
	"powershell",
	"read",
	"write",
	"tool_search",
]);

export interface GuidanceFields {
	description?: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
}

export interface ToolSettings {
	enabled: boolean;
	name: string;
}

export interface ContextSettings {
	maxInlineChars: number | null;
	maxInlineLines: number | null;
	spillToFile: boolean;
}

export interface SearchSettings {
	defaultMaxResults: number;
	maxResultsLimit: number;
}

export interface FetchSettings {
	extractors: ExtractorId[];
	minChars: number;
	allowRaw: boolean;
	maxCharsPerPage: number;
}

export interface GitHubHandlerSettings {
	enabled: boolean;
	command: string;
	timeoutMs: number;
	maxChars: number;
}

export type Raw = Record<string, unknown>;
/** 校验错误文本列表，格式 `<field path>: <reason>`。 */
export type Errors = string[];

/** 已完成校验、clamp 与 env key 合并的最终配置。 */
export interface ResolvedConfig {
	provider: ProviderId;
	apiKeys: Partial<Record<ApiKeyId, string>>;
	proxy: string | undefined;
	timeoutMs: number;
	userAgent: string;
	tools: Record<ToolId, ToolSettings>;
	activation: "eager" | "deferred";
	guidance: Partial<Record<ToolId, GuidanceFields>>;
	context: ContextSettings;
	search: SearchSettings;
	fetch: FetchSettings;
	handlers: { github: GitHubHandlerSettings };
}

function readPackageVersion(): string {
	const url = new URL("../package.json", import.meta.url);
	const pkg = JSON.parse(readFileSync(url, "utf-8")) as { version?: unknown };
	if (typeof pkg.version !== "string" || pkg.version.trim() === "") {
		throw new Error(`package.json has no usable version field: ${url.pathname}`);
	}
	return pkg.version;
}
