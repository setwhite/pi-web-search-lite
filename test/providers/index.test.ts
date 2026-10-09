import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "../../config/index.ts";
import { createHttpClient } from "../../http/index.ts";
import { createSearchProvider, ProviderError, resolveApiKey, resolveProviderId } from "../../providers/index.ts";

describe("createSearchProvider", () => {
	it("按 id 分发到对应 provider", () => {
		const http = createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" });
		for (const id of PROVIDER_IDS) {
			expect(createSearchProvider(id, { http, apiKey: "test-key" }).id).toBe(id);
		}
	});
});

describe("resolveProviderId", () => {
	it("优先级：provider 参数 > WEB_SEARCH_PROVIDER > config.provider > tavily", () => {
		expect(resolveProviderId("brave", "tavily", { WEB_SEARCH_PROVIDER: "exa" })).toBe("brave");
		expect(resolveProviderId(undefined, "tavily", { WEB_SEARCH_PROVIDER: "exa" })).toBe("exa");
		expect(resolveProviderId(undefined, "brave", {})).toBe("brave");
		expect(resolveProviderId(undefined, undefined, {})).toBe("tavily");
	});

	it("空串 / 纯空白视为未提供", () => {
		expect(resolveProviderId("", "exa", { WEB_SEARCH_PROVIDER: "  " })).toBe("exa");
	});

	it("未知名字抛 ProviderError 并列出三个合法值", () => {
		try {
			resolveProviderId("google", undefined, {});
			throw new Error("预期抛错但放行");
		} catch (error) {
			expect(error).toBeInstanceOf(ProviderError);
			expect((error as ProviderError).type).toBe("unknown_provider");
			expect((error as ProviderError).message).toContain("tavily");
			expect((error as ProviderError).message).toContain("brave");
			expect((error as ProviderError).message).toContain("exa");
		}
	});

	it("环境变量里的未知名字同样抛错", () => {
		expect(() => resolveProviderId(undefined, undefined, { WEB_SEARCH_PROVIDER: "serper" })).toThrowError(ProviderError);
	});
});

describe("resolveApiKey", () => {
	it("命中时返回 key", () => {
		expect(resolveApiKey("exa", { exa: "exa-key" })).toBe("exa-key");
	});

	it("缺 key 的报错同时含环境变量名与 config.apiKeys 键名", () => {
		try {
			resolveApiKey("brave", {});
			throw new Error("预期抛错但放行");
		} catch (error) {
			expect(error).toBeInstanceOf(ProviderError);
			expect((error as ProviderError).type).toBe("missing_api_key");
			expect((error as ProviderError).message).toContain("BRAVE_API_KEY");
			expect((error as ProviderError).message).toContain("config.apiKeys.brave");
		}
	});

	it("新增 provider 的缺 key 文案同样给出环境变量名与配置键名", () => {
		for (const [id, envName] of [
			["firecrawl", "FIRECRAWL_API_KEY"],
			["perplexity", "PERPLEXITY_API_KEY"],
		] as const) {
			try {
				resolveApiKey(id, {});
				throw new Error("预期抛错但放行");
			} catch (error) {
				expect(error).toBeInstanceOf(ProviderError);
				expect((error as ProviderError).message).toContain(envName);
				expect((error as ProviderError).message).toContain(`config.apiKeys.${id}`);
			}
		}
	});
});
