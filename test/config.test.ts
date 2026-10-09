import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfigPath, loadConfig } from "../config/index.ts";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as { version: string };

const createdDirs: string[] = [];

/** 新建临时目录；测试结束后由 afterEach 统一删除。 */
function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-web-search-lite-test-"));
	createdDirs.push(dir);
	return dir;
}

/** 在临时目录写入 config.json 片段，返回配置文件绝对路径。 */
function writeConfig(content: string): string {
	const path = join(makeTempDir(), "config.json");
	writeFileSync(path, content, "utf-8");
	return path;
}

/** 捕获同步调用抛出的错误文本，未抛错时抛出断言失败。 */
function captureError(run: () => unknown): string {
	try {
		run();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("期望抛出错误，但调用成功返回");
}

afterEach(() => {
	for (const dir of createdDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("loadConfig", () => {
	it("配置文件缺失时全部取默认值", () => {
		const path = join(makeTempDir(), "missing", "config.json");
		const config = loadConfig({ configPath: path, env: {} });

		expect(config).toMatchObject({
			provider: "tavily",
			apiKeys: {},
			proxy: undefined,
			timeoutMs: 30_000,
			tools: {
				web_search: { enabled: true, name: "web_search" },
				web_fetch: { enabled: true, name: "web_fetch" },
			},
			activation: "eager",
			guidance: {},
			context: { maxInlineChars: null, maxInlineLines: null, spillToFile: true },
			search: { defaultMaxResults: 5, maxResultsLimit: 10 },
			fetch: {
				extractors: ["html", "jina"],
				minChars: 200,
				allowRaw: false,
				maxCharsPerPage: 150_000,
			},
			handlers: { github: { enabled: true, command: "gh", timeoutMs: 30_000, maxChars: 150_000 } },
		});
		expect(config.userAgent).toBe(`pi-web-search-lite/${pkg.version}`);
	});

	it("环境变量 API key 优先于配置文件，未覆盖的沿用文件值", () => {
		const path = writeConfig(JSON.stringify({ apiKeys: { tavily: "file-tavily", brave: "file-brave" } }));
		const config = loadConfig({ configPath: path, env: { TAVILY_API_KEY: "env-tavily" } });

		expect(config.apiKeys).toEqual({ tavily: "env-tavily", brave: "file-brave" });
	});

	it("非法字段的错误同时包含配置文件绝对路径与字段路径", () => {
		const path = writeConfig(JSON.stringify({ timeoutMs: "fast" }));
		const message = captureError(() => loadConfig({ configPath: path, env: {} }));

		expect(message).toContain(path);
		expect(message).toContain("timeoutMs");
	});

	it("嵌套非法字段报出完整字段路径", () => {
		const path = writeConfig(JSON.stringify({ tools: { web_search: { name: 123 } } }));
		const message = captureError(() => loadConfig({ configPath: path, env: {} }));

		expect(message).toContain(path);
		expect(message).toContain("tools.web_search.name");
	});

	it("JSON 损坏时的错误包含配置文件绝对路径", () => {
		const path = writeConfig("{ not json");
		const message = captureError(() => loadConfig({ configPath: path, env: {} }));

		expect(message).toContain(path);
	});

	it("timeoutMs 越界被 clamp 到 1_000–120_000", () => {
		const low = loadConfig({ configPath: writeConfig(JSON.stringify({ timeoutMs: 10 })), env: {} });
		const high = loadConfig({ configPath: writeConfig(JSON.stringify({ timeoutMs: 999_999 })), env: {} });

		expect(low.timeoutMs).toBe(1_000);
		expect(high.timeoutMs).toBe(120_000);
	});

	it("fetch.minChars 越界被 clamp 到 0–100_000", () => {
		const low = loadConfig({ configPath: writeConfig(JSON.stringify({ fetch: { minChars: -5 } })), env: {} });
		const high = loadConfig({ configPath: writeConfig(JSON.stringify({ fetch: { minChars: 10_000_000 } })), env: {} });

		expect(low.fetch.minChars).toBe(0);
		expect(high.fetch.minChars).toBe(100_000);
	});

	it("search.maxResultsLimit 越界被 clamp 到 1–20，defaultMaxResults 不超过 limit", () => {
		const low = loadConfig({ configPath: writeConfig(JSON.stringify({ search: { maxResultsLimit: 0 } })), env: {} });
		const high = loadConfig({ configPath: writeConfig(JSON.stringify({ search: { maxResultsLimit: 99 } })), env: {} });
		const capped = loadConfig({
			configPath: writeConfig(JSON.stringify({ search: { maxResultsLimit: 3, defaultMaxResults: 50 } })),
			env: {},
		});

		expect(low.search).toEqual({ defaultMaxResults: 1, maxResultsLimit: 1 });
		expect(high.search.maxResultsLimit).toBe(20);
		expect(capped.search).toEqual({ defaultMaxResults: 3, maxResultsLimit: 3 });
	});

	it("两个工具同时 enabled: false 时报错", () => {
		const path = writeConfig(JSON.stringify({ tools: { web_search: { enabled: false }, web_fetch: { enabled: false } } }));
		const message = captureError(() => loadConfig({ configPath: path, env: {} }));

		expect(message).toContain("web_search");
		expect(message).toContain("web_fetch");
	});

	it("工具名不合法、占用宿主保留名或重复时报错", () => {
		const badSyntax = captureError(() =>
			loadConfig({ configPath: writeConfig(JSON.stringify({ tools: { web_search: { name: "1bad" } } })), env: {} }),
		);
		const reserved = captureError(() =>
			loadConfig({ configPath: writeConfig(JSON.stringify({ tools: { web_search: { name: "read" } } })), env: {} }),
		);
		const duplicated = captureError(() =>
			loadConfig({ configPath: writeConfig(JSON.stringify({ tools: { web_fetch: { name: "web_search" } } })), env: {} }),
		);

		expect(badSyntax).toContain("tools.web_search.name");
		expect(reserved).toContain("tools.web_search.name");
		expect(duplicated).toContain("tools");
	});

	it("未知 provider 报错并列出合法值", () => {
		const path = writeConfig(JSON.stringify({ provider: "google" }));
		const message = captureError(() => loadConfig({ configPath: path, env: {} }));

		expect(message).toContain("tavily");
		expect(message).toContain("brave");
		expect(message).toContain("exa");
		expect(message).toContain("firecrawl");
		expect(message).toContain("perplexity");
	});

	it("provider 接受 firecrawl 与 perplexity", () => {
		const firecrawl = loadConfig({ configPath: writeConfig(JSON.stringify({ provider: "firecrawl" })), env: {} });
		const perplexity = loadConfig({ configPath: writeConfig(JSON.stringify({ provider: "perplexity" })), env: {} });

		expect(firecrawl.provider).toBe("firecrawl");
		expect(perplexity.provider).toBe("perplexity");
	});

	it("fetch.extractors 接受 firecrawl 与 jina，且不动默认链", () => {
		const config = loadConfig({
			configPath: writeConfig(JSON.stringify({ fetch: { extractors: ["jina", "firecrawl"] } })),
			env: {},
		});

		expect(config.fetch.extractors).toEqual(["jina", "firecrawl"]);
	});

	it("新增 key 支持环境变量与配置文件，环境变量优先", () => {
		const path = writeConfig(JSON.stringify({ apiKeys: { jina: "file-jina", firecrawl: "file-fc" } }));
		const config = loadConfig({
			configPath: path,
			env: { FIRECRAWL_API_KEY: "env-fc", PERPLEXITY_API_KEY: "env-pplx", JINA_API_KEY: "env-jina" },
		});

		expect(config.apiKeys).toEqual({ firecrawl: "env-fc", perplexity: "env-pplx", jina: "env-jina" });
	});

	it("未知 apiKeys 键仍然报错", () => {
		const path = writeConfig(JSON.stringify({ apiKeys: { serpapi: "k" } }));
		const message = captureError(() => loadConfig({ configPath: path, env: {} }));

		expect(message).toContain("apiKeys.serpapi");
	});

	it("socks5 代理在配置校验阶段报错", () => {
		const path = writeConfig(JSON.stringify({ proxy: "socks5://127.0.0.1:1080" }));
		const message = captureError(() => loadConfig({ configPath: path, env: {} }));

		expect(message).toContain("proxy");
		expect(message).toContain("http");
	});
});

describe("defaultConfigPath", () => {
	it("优先取 PI_CODING_AGENT_DIR，其次取 ~/.pi/agent", () => {
		const fromEnv = defaultConfigPath({ PI_CODING_AGENT_DIR: "C:\\custom\\agent" });
		expect(fromEnv).toContain("custom");
		expect(fromEnv).toContain("pi-web-search-lite");

		const fallback = defaultConfigPath({});
		expect(fallback).toContain(".pi");
		expect(fallback).toContain("pi-web-search-lite");
	});
});
