/**
 * 配置校验：逐字段检查类型、枚举与名称规则，数值越界 clamp。
 * 只被 index.ts 调用；错误文本格式为 `<字段路径>：<原因>`，由 index.ts 汇总抛出。
 */

import {
	DEFAULT_EXTRACTORS,
	DEFAULT_HANDLER_COMMAND,
	DEFAULT_HANDLER_MAX_CHARS,
	DEFAULT_HANDLER_TIMEOUT_MS,
	DEFAULT_MAX_CHARS_PER_PAGE,
	DEFAULT_MAX_RESULTS,
	DEFAULT_MAX_RESULTS_LIMIT,
	DEFAULT_MIN_CHARS,
	DEFAULT_PROVIDER,
	DEFAULT_TIMEOUT_MS,
	DEFAULT_USER_AGENT,
	EXTRACTOR_IDS,
	MAX_INLINE_CHARS_MIN,
	MAX_INLINE_LINES_MIN,
	PROVIDER_ENV_KEYS,
	PROVIDER_IDS,
	RANGES,
	RESERVED_TOOL_NAMES,
	TOOL_IDS,
	TOOL_NAME_PATTERN,
	type ContextSettings,
	type Errors,
	type ExtractorId,
	type FetchSettings,
	type GuidanceFields,
	type GitHubHandlerSettings,
	type ProviderId,
	type Raw,
	type ResolvedConfig,
	type SearchSettings,
	type ToolId,
	type ToolSettings,
} from "./schema.ts";
import {
	asObject,
	checkUnknownKeys,
	optionalString,
	readBoolean,
	readEnum,
	readNullableNumber,
	readNumber,
	readString,
	readStringArray,
} from "./readers.ts";

// ---------------------------------------------------------------------------
// 校验：每个字段非法时记一条错误并回退默认值；收集完统一由 loadConfig 抛出。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 顶层聚合
// ---------------------------------------------------------------------------

/** 空字符串环境变量视为未设置（不报错，回退文件值）。 */
function envNonEmpty(value: string | undefined): string | undefined {
	return value !== undefined && value.trim() !== "" ? value : undefined;
}

export function buildConfig(raw: Raw, env: NodeJS.ProcessEnv, errors: Errors): ResolvedConfig {
	checkUnknownKeys(
		raw,
		["provider", "apiKeys", "proxy", "timeoutMs", "userAgent", "tools", "activation", "guidance", "context", "search", "fetch", "handlers"],
		"",
		errors,
	);
	const tools = readTools(raw.tools, errors);
	if (!tools.web_search.enabled && !tools.web_fetch.enabled) {
		errors.push("tools：web_search 与 web_fetch 不能同时 enabled: false，至少保留一个");
	}
	return {
		provider: readEnum(raw.provider, PROVIDER_IDS, DEFAULT_PROVIDER, "provider", errors),
		apiKeys: readApiKeys(raw.apiKeys, env, errors),
		proxy: readProxy(raw.proxy, errors),
		timeoutMs: readNumber(raw.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs", errors, RANGES.timeoutMs),
		userAgent: readString(raw.userAgent, DEFAULT_USER_AGENT, "userAgent", errors),
		tools,
		activation: readEnum(raw.activation, ["eager", "deferred"] as const, "eager", "activation", errors),
		guidance: readGuidance(raw.guidance, errors),
		context: readContext(raw.context, errors),
		search: readSearch(raw.search, errors),
		fetch: readFetch(raw.fetch, errors),
		handlers: readHandlers(raw.handlers, errors),
	};
}

function readApiKeys(value: unknown, env: NodeJS.ProcessEnv, errors: Errors): Partial<Record<ProviderId, string>> {
	const raw = asObject(value, "apiKeys", errors) ?? {};
	checkUnknownKeys(raw, PROVIDER_IDS, "apiKeys", errors);
	const keys: Partial<Record<ProviderId, string>> = {};
	for (const id of PROVIDER_IDS) {
		const fromFile = optionalString(raw[id], `apiKeys.${id}`, errors);
		const fromEnv = envNonEmpty(env[PROVIDER_ENV_KEYS[id]]);
		if (fromEnv !== undefined) keys[id] = fromEnv;
		else if (fromFile !== undefined) keys[id] = fromFile;
	}
	return keys;
}

function readProxy(value: unknown, errors: Errors): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") {
		errors.push(`proxy：期望 http/https URL 字符串，实际 ${JSON.stringify(value)}`);
		return undefined;
	}
	const text = value.trim();
	if (text === "") return undefined; // 空串 = 强制直连
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		errors.push(`proxy：不是合法 URL，实际 ${JSON.stringify(value)}`);
		return undefined;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		errors.push(`proxy：只支持 http/https 代理，实际 ${url.protocol}//`);
		return undefined;
	}
	return text;
}

function readTools(value: unknown, errors: Errors): Record<ToolId, ToolSettings> {
	const raw = asObject(value, "tools", errors) ?? {};
	checkUnknownKeys(raw, TOOL_IDS, "tools", errors);
	const tools = {
		web_search: readToolSettings(raw.web_search, "tools.web_search", "web_search", errors),
		web_fetch: readToolSettings(raw.web_fetch, "tools.web_fetch", "web_fetch", errors),
	};
	if (tools.web_search.name === tools.web_fetch.name) {
		errors.push(`tools：两个工具的名称不能相同（都是 "${tools.web_search.name}"）`);
	}
	return tools;
}

function readToolSettings(value: unknown, path: string, defaultName: string, errors: Errors): ToolSettings {
	const raw = asObject(value, path, errors) ?? {};
	checkUnknownKeys(raw, ["enabled", "name"], path, errors);
	const name = readString(raw.name, defaultName, `${path}.name`, errors);
	if (typeof raw.name === "string" && raw.name.trim() !== "") {
		if (!TOOL_NAME_PATTERN.test(name)) {
			errors.push(`${path}.name：只能以字母开头、只含字母数字下划线连字符，实际 ${JSON.stringify(name)}`);
		} else if (RESERVED_TOOL_NAMES.has(name)) {
			errors.push(`${path}.name："${name}" 是宿主保留工具名`);
		}
	}
	return { enabled: readBoolean(raw.enabled, true, `${path}.enabled`, errors), name };
}

function readGuidance(value: unknown, errors: Errors): Partial<Record<ToolId, GuidanceFields>> {
	const raw = asObject(value, "guidance", errors);
	if (raw === undefined) return {};
	checkUnknownKeys(raw, TOOL_IDS, "guidance", errors);
	const guidance: Partial<Record<ToolId, GuidanceFields>> = {};
	for (const id of TOOL_IDS) {
		if (raw[id] !== undefined) guidance[id] = readGuidanceFields(raw[id], `guidance.${id}`, errors);
	}
	return guidance;
}

function readGuidanceFields(value: unknown, path: string, errors: Errors): GuidanceFields {
	const raw = asObject(value, path, errors) ?? {};
	checkUnknownKeys(raw, ["description", "promptSnippet", "promptGuidelines"], path, errors);
	const fields: GuidanceFields = {};
	const description = optionalString(raw.description, `${path}.description`, errors);
	const snippet = optionalString(raw.promptSnippet, `${path}.promptSnippet`, errors);
	if (description !== undefined) fields.description = description;
	if (snippet !== undefined) fields.promptSnippet = snippet;
	if (raw.promptGuidelines !== undefined) {
		fields.promptGuidelines = readStringArray(raw.promptGuidelines, `${path}.promptGuidelines`, errors);
	}
	return fields;
}

function readContext(value: unknown, errors: Errors): ContextSettings {
	const raw = asObject(value, "context", errors) ?? {};
	checkUnknownKeys(raw, ["maxInlineChars", "maxInlineLines", "spillToFile"], "context", errors);
	return {
		maxInlineChars: readNullableNumber(raw.maxInlineChars, "context.maxInlineChars", errors, MAX_INLINE_CHARS_MIN),
		maxInlineLines: readNullableNumber(raw.maxInlineLines, "context.maxInlineLines", errors, MAX_INLINE_LINES_MIN),
		spillToFile: readBoolean(raw.spillToFile, true, "context.spillToFile", errors),
	};
}

function readSearch(value: unknown, errors: Errors): SearchSettings {
	const raw = asObject(value, "search", errors) ?? {};
	checkUnknownKeys(raw, ["defaultMaxResults", "maxResultsLimit"], "search", errors);
	const maxResultsLimit = readNumber(raw.maxResultsLimit, DEFAULT_MAX_RESULTS_LIMIT, "search.maxResultsLimit", errors, RANGES.maxResultsLimit);
	const defaultMaxResults = readNumber(
		raw.defaultMaxResults,
		DEFAULT_MAX_RESULTS,
		"search.defaultMaxResults",
		errors,
		[1, maxResultsLimit],
	);
	return { defaultMaxResults, maxResultsLimit };
}

function readFetch(value: unknown, errors: Errors): FetchSettings {
	const raw = asObject(value, "fetch", errors) ?? {};
	checkUnknownKeys(raw, ["extractors", "minChars", "allowRaw", "maxCharsPerPage"], "fetch", errors);
	return {
		extractors: readExtractors(raw.extractors, errors),
		minChars: readNumber(raw.minChars, DEFAULT_MIN_CHARS, "fetch.minChars", errors, RANGES.minChars),
		allowRaw: readBoolean(raw.allowRaw, true, "fetch.allowRaw", errors),
		maxCharsPerPage: readNumber(raw.maxCharsPerPage, DEFAULT_MAX_CHARS_PER_PAGE, "fetch.maxCharsPerPage", errors, RANGES.maxCharsPerPage),
	};
}

function isExtractorId(value: unknown): value is ExtractorId {
	return typeof value === "string" && (EXTRACTOR_IDS as readonly string[]).includes(value);
}

function readExtractors(value: unknown, errors: Errors): ExtractorId[] {
	if (value === undefined) return [...DEFAULT_EXTRACTORS];
	if (!Array.isArray(value) || value.length === 0) {
		errors.push("fetch.extractors：期望非空数组");
		return [...DEFAULT_EXTRACTORS];
	}
	const extractors: ExtractorId[] = [];
	for (const item of value) {
		if (!isExtractorId(item)) {
			errors.push(`fetch.extractors：只支持 ${EXTRACTOR_IDS.join(" / ")}，实际 ${JSON.stringify(item)}`);
			continue;
		}
		if (!extractors.includes(item)) extractors.push(item);
	}
	return extractors.length > 0 ? extractors : [...DEFAULT_EXTRACTORS];
}

function readHandlers(value: unknown, errors: Errors): { github: GitHubHandlerSettings } {
	const raw = asObject(value, "handlers", errors) ?? {};
	checkUnknownKeys(raw, ["github"], "handlers", errors);
	const github = asObject(raw.github, "handlers.github", errors) ?? {};
	checkUnknownKeys(github, ["enabled", "command", "timeoutMs", "maxChars"], "handlers.github", errors);
	return {
		github: {
			enabled: readBoolean(github.enabled, true, "handlers.github.enabled", errors),
			command: readString(github.command, DEFAULT_HANDLER_COMMAND, "handlers.github.command", errors),
			timeoutMs: readNumber(github.timeoutMs, DEFAULT_HANDLER_TIMEOUT_MS, "handlers.github.timeoutMs", errors, RANGES.handlerTimeoutMs),
			maxChars: readNumber(github.maxChars, DEFAULT_HANDLER_MAX_CHARS, "handlers.github.maxChars", errors, RANGES.handlerMaxChars),
		},
	};
}
