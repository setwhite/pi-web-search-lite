/**
 * provider 注册表、解析与工厂。
 * - 解析优先级（first wins）：`provider` 参数 > `WEB_SEARCH_PROVIDER` 环境变量 > `config.provider` > `"tavily"`。
 * - key 已由配置层把 `PROVIDER_ENV_KEYS` 环境变量合并进 `config.apiKeys`，这里只做存在性检查。
 */

import { PROVIDER_ENV_KEYS, PROVIDER_IDS, type ProviderId } from "../config/index.ts";
import { createBraveProvider } from "./brave.ts";
import { createExaProvider } from "./exa.ts";
import { createTavilyProvider } from "./tavily.ts";
import type { ProviderRuntime, SearchProvider } from "./types.ts";

export * from "./types.ts";

export type ProviderErrorType = "unknown_provider" | "missing_api_key";

/** 结构化 provider 错误；模型可见文案由 tools/ 组装。 */
export class ProviderError extends Error {
	readonly type: ProviderErrorType;

	constructor(type: ProviderErrorType, message: string) {
		super(message);
		this.name = "ProviderError";
		this.type = type;
	}
}

export const DEFAULT_PROVIDER: ProviderId = "tavily";
export const SEARCH_PROVIDER_ENV_KEY = "WEB_SEARCH_PROVIDER";

/** 四层解析；未知名字直接抛错，不静默回落。 */
export function resolveProviderId(
	override: string | undefined,
	configProvider: ProviderId | undefined,
	env: NodeJS.ProcessEnv = process.env,
): ProviderId {
	const candidate = override?.trim() || env[SEARCH_PROVIDER_ENV_KEY]?.trim() || configProvider || DEFAULT_PROVIDER;
	if ((PROVIDER_IDS as readonly string[]).includes(candidate)) return candidate as ProviderId;
	throw new ProviderError(
		"unknown_provider",
		`unknown provider "${candidate}"; valid values: ${PROVIDER_IDS.join(", ")}. Check the web_search "provider" argument, the ${SEARCH_PROVIDER_ENV_KEY} env var, or the config.provider field.`,
	);
}

/** 取选中 provider 的 key；缺失时报错并写明两个配置位置。 */
export function resolveApiKey(id: ProviderId, apiKeys: Partial<Record<ProviderId, string>>): string {
	const apiKey = apiKeys[id]?.trim();
	if (apiKey) return apiKey;
	throw new ProviderError(
		"missing_api_key",
		`provider "${id}" is missing an API key: set the ${PROVIDER_ENV_KEYS[id]} env var, or fill config.apiKeys.${id} in the config file.`,
	);
}

export function createSearchProvider(id: ProviderId, runtime: ProviderRuntime): SearchProvider {
	switch (id) {
		case "tavily":
			return createTavilyProvider(runtime);
		case "brave":
			return createBraveProvider(runtime);
		case "exa":
			return createExaProvider(runtime);
	}
}
