/**
 * 可选的真链路冒烟：只在发版前手跑 `pnpm test:e2e`，不进 CI（`vitest.config.ts` 已把它排除在 `pnpm test` 之外）。
 * 夹具测不到的漂移在这里暴露：上游字段改名、鉴权头变化、响应形状变化。
 * 有 key 的 provider 逐家跑（env `<X>_API_KEY` 或 config `apiKeys.<id>`），缺 key 报 skip 而不是失败。
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { API_KEY_ENV_KEYS, loadConfig, PROVIDER_IDS } from "../../config/index.ts";
import { createHttpClient } from "../../http/index.ts";
import { createSearchProvider } from "../../providers/index.ts";

const config = loadConfig();
const http = createHttpClient({
	proxy: config.proxy,
	timeoutMs: config.timeoutMs,
	userAgent: config.userAgent,
});

/** env 优先，其次配置文件里的 apiKeys；两者都没有就是空串（= skip）。 */
const apiKeyFor = (id: (typeof PROVIDER_IDS)[number]): string =>
	(process.env[API_KEY_ENV_KEYS[id]] ?? config.apiKeys[id] ?? "").trim();

const QUERY = "pi coding agent";

describe("provider 真链路", () => {
	for (const id of PROVIDER_IDS) {
		it.skipIf(apiKeyFor(id) === "")(`${id}：live 搜索的响应仍能被映射`, async () => {
			const provider = createSearchProvider(id, { http, apiKey: apiKeyFor(id) });
			const results = await provider.search({ query: QUERY, maxResults: 3 });

			expect(results.length, `${id} 返回 0 条，可能改了字段名或鉴权`).toBeGreaterThan(0);
			for (const result of results) {
				expect(result.url).toMatch(/^https?:\/\//);
				expect(result.title.length).toBeGreaterThan(0);
			}
		});
	}
});

describe("http 真链路", () => {
	it("抓一个稳定公开页能拿到正文", async () => {
		const result = await http.fetchText("https://example.com/");
		expect(result.status).toBe(200);
		expect(result.text).toContain("Example Domain");
	});

	it("缺省配置不读本机配置文件时给出全默认值", () => {
		const defaults = loadConfig({
			env: {},
			configPath: join(tmpdir(), "pi-web-search-lite-empty.json"),
		});
		expect(defaults.provider).toBe("tavily");
		expect(defaults.fetch.extractors).toEqual(["html", "jina"]);
	});
});
