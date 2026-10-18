import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "../../config/index.ts";
import { createHttpClient } from "../../http/index.ts";
import { createSearchProvider, ProviderError, resolveApiKey, resolveProviderId } from "../../providers/index.ts";

/** 只认声明语句：import 与「从 config 重导出」都不算重复定义。 */
const DECLARES_DEFAULT_PROVIDER = /\b(?:const|let|var)\s+DEFAULT_PROVIDER\b/;
const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** 包内源码文本（跳过 node_modules、点目录与 test/）：静态断言默认值只有一处定义，路径用 / 分隔。 */
function packageSourceFiles(): Array<{ path: string; text: string }> {
	const walk = (dir: string): string[] =>
		readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
			if (entry.isDirectory()) return entry.name === "test" ? [] : walk(join(dir, entry.name));
			return entry.name.endsWith(".ts") ? [join(dir, entry.name)] : [];
		});
	return walk(REPO_ROOT).map((path) => ({ path: relative(REPO_ROOT, path).split(sep).join("/"), text: readFileSync(path, "utf-8") }));
}

describe("createSearchProvider", () => {
	it("按 id 分发到对应 provider", () => {
		const http = createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" });
		for (const id of PROVIDER_IDS) {
			expect(createSearchProvider(id, { http, apiKey: "test-key" }).id).toBe(id);
		}
	});
});

describe("resolveProviderId", () => {
	it("优先级：WEB_SEARCH_PROVIDER > config.provider（默认值在配置层，本层不回落）", () => {
		expect(resolveProviderId("tavily", { WEB_SEARCH_PROVIDER: "exa" })).toBe("exa");
		expect(resolveProviderId("brave", {})).toBe("brave");
	});

	it("空串 / 纯空白视为未提供", () => {
		expect(resolveProviderId("exa", { WEB_SEARCH_PROVIDER: "  " })).toBe("exa");
	});

	it("未知名字抛 ProviderError 并列出全部合法值，不提工具参数", () => {
		try {
			resolveProviderId("exa", { WEB_SEARCH_PROVIDER: "google" });
			throw new Error("预期抛错但放行");
		} catch (error) {
			expect(error).toBeInstanceOf(ProviderError);
			expect((error as ProviderError).type).toBe("unknown_provider");
			expect((error as ProviderError).message).toContain("tavily");
			expect((error as ProviderError).message).toContain("brave");
			expect((error as ProviderError).message).toContain("exa");
			expect((error as ProviderError).message).not.toContain("argument");
		}
	});
});

describe("默认值单源", () => {
	it("包内源码只在 config/schema.ts 声明一处", () => {
		const declaring = packageSourceFiles()
			.filter((file) => DECLARES_DEFAULT_PROVIDER.test(file.text))
			.map((file) => file.path);

		expect(declaring).toEqual(["config/schema.ts"]);
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
			["parallel", "PARALLEL_API_KEY"],
			["keenable", "KEENABLE_API_KEY"],
			["deepseek", "DEEPSEEK_API_KEY"],
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
