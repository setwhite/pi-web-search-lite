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
			'provider "tavily" 缺少 API key：请设置环境变量 TAVILY_API_KEY，或在配置文件的 config.apiKeys.tavily 字段填写。',
		);
	});

	it("配置值非法时报绝对路径、字段路径与合法取值", async () => {
		const path = tempConfig(JSON.stringify({ proxy: "socks5://127.0.0.1:12450" }));

		const error = await rejectionOf(
			Promise.resolve().then(() => loadConfig({ configPath: path, env: {} })),
		);

		expect(error.message.replace(path, "<config>")).toBe(
			"配置文件 <config> 有 1 处非法字段：\n- proxy：只支持 http/https 代理，实际 socks5://",
		);
	});

	it("配置不是合法 JSON 时报绝对路径与解析错误", async () => {
		const path = tempConfig("{ 不是 JSON");

		const error = await rejectionOf(
			Promise.resolve().then(() => loadConfig({ configPath: path, env: {} })),
		);

		expect(error.message.replace(path, "<config>")).toContain("配置文件 <config> 不是合法 JSON：");
	});

	it("gh 未安装时给出安装提示与配置键", async () => {
		const availability = await checkGhAvailable("gh-missing-xyz", { exec: execGh, timeoutMs: 5_000, env: process.env });

		expect(availability.ok).toBe(false);
		expect(availability.reason).toContain("未找到可用的 gh 命令（gh-missing-xyz）");
		expect(availability.reason).toContain("请安装 GitHub CLI 或修改 handlers.github.command。");
	});

	it("gh 未登录时提示先登录", async () => {
		const exec = async (_command: string, args: string[]): Promise<GhExecResult> =>
			args[0] === "--version"
				? { ok: true, stdout: "gh version 2.0.0", stderr: "" }
				: { ok: false, stdout: "", stderr: "HTTP 401: Bad credentials", error: "" };

		const availability = await checkGhAvailable("gh-probe-fake", { exec, timeoutMs: 5_000, env: {} });

		expect(availability.reason).toBe("gh 未登录：HTTP 401: Bad credentials。请先运行 gh auth login。");
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
				"所有提取器均未产出有效内容（共 3 个）：",
				"- tavily：跳过（未配置 TAVILY_API_KEY / config.apiKeys.tavily）",
				"- exa：跳过（未配置 EXA_API_KEY / config.apiKeys.exa）",
				"- html：失败（HTTP 500）",
			].join("\n"),
		);
	});
});
