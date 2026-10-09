/**
 * T8 回归：模型可见错误文案快照（缺 key / 坏配置 / gh 未安装 / gh 未登录 / 提取器全败）。
 * 涉及临时路径的用例先把绝对路径归一化成 <config>，只锁文案结构。
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config/index.ts";
import { extractWithChain } from "../../extractors/index.ts";
import { checkGhAvailable, execGh, resetGhProbeCache } from "../../handlers/github/gh.ts";
import type { GhExecResult } from "../../handlers/types.ts";
import { executeSearch } from "../../tools/search.ts";
import { fakeHttp, makeConfig, rejectionOf } from "../tools/fixtures.ts";

const dirs: string[] = [];

function tempConfig(content: string): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-web-search-lite-reg-"));
	dirs.push(dir);
	const path = join(dir, "config.json");
	writeFileSync(path, content, "utf-8");
	return path;
}

afterEach(() => {
	resetGhProbeCache();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("回归：错误文案", () => {
	it("缺 API key 时指明环境变量与配置键", async () => {
		const error = await rejectionOf(
			executeSearch(makeConfig({ apiKeys: {} }), { query: "pi" }, undefined, {
				http: fakeHttp(() => ({ text: "{}" })),
			}),
		);

		expect(error.message).toBe(
			'provider "tavily" is missing an API key: set the TAVILY_API_KEY env var, or fill config.apiKeys.tavily in the config file.',
		);
	});

	it("配置值非法时报绝对路径、字段路径与合法取值", async () => {
		const path = tempConfig(JSON.stringify({ proxy: "socks5://127.0.0.1:12450" }));

		const error = await rejectionOf(
			Promise.resolve().then(() => loadConfig({ configPath: path, env: {} })),
		);

		expect(error.message.replace(path, "<config>")).toBe(
			"<config>: 1 invalid field(s):\n- proxy: only http/https proxies are supported, got socks5://",
		);
	});

	it("配置不是合法 JSON 时报绝对路径与解析错误", async () => {
		const path = tempConfig("{ 不是 JSON");

		const error = await rejectionOf(
			Promise.resolve().then(() => loadConfig({ configPath: path, env: {} })),
		);

		expect(error.message.replace(path, "<config>")).toContain("config file <config> is not valid JSON:");
	});

	it("gh 未安装时给出安装提示与配置键", async () => {
		const availability = await checkGhAvailable("gh-missing-xyz", { exec: execGh, timeoutMs: 5_000, env: process.env });

		expect(availability.ok).toBe(false);
		expect(availability.reason).toContain("gh command not found (gh-missing-xyz)");
		expect(availability.reason).toContain("Install GitHub CLI or change handlers.github.command.");
	});

	it("gh 未登录时提示先登录", async () => {
		const exec = async (_command: string, args: string[]): Promise<GhExecResult> =>
			args[0] === "--version"
				? { ok: true, stdout: "gh version 2.0.0", stderr: "" }
				: { ok: false, stdout: "", stderr: "HTTP 401: Bad credentials", error: "" };

		const availability = await checkGhAvailable("gh-probe-fake", { exec, timeoutMs: 5_000, env: {} });

		expect(availability.reason).toBe("gh is not authenticated: HTTP 401: Bad credentials. Run gh auth login first.");
	});

	it("提取器全败时逐行聚合每个提取器的原因", async () => {
		const error = await rejectionOf(
			extractWithChain("https://example.test/x", ["tavily", "exa", "html"], {
				http: fakeHttp(() => {
					throw new Error("HTTP 500");
				}),
				apiKeys: {},
				minChars: 200,
				maxCharsPerPage: 5_000,
			}),
		);

		expect(error.message).toBe(
			[
				"all extractors failed to produce usable content (3 tried):",
				"- tavily: skipped (not configured (TAVILY_API_KEY env var or config.apiKeys.tavily))",
				"- exa: skipped (not configured (EXA_API_KEY env var or config.apiKeys.exa))",
				"- html: failed (HTTP 500)",
			].join("\n"),
		);
	});
});
