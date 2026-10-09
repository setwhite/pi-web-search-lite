import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ghEnv, GH_MAX_BUFFER, resetGhProbeCache, execGh } from "../../handlers/github/gh.ts";
import { githubHandler } from "../../handlers/github/index.ts";
import type { GhExecResult, GhExecutor, HandlerContext, HandlerSkip, HandlerSuccess } from "../../handlers/types.ts";
import { baseContext, ISSUE } from "./fixtures.ts";

beforeEach(() => resetGhProbeCache());

function ok(stdout: string): GhExecResult {
	return { ok: true, stdout, stderr: "" };
}

function asSkip(outcome: HandlerSuccess | HandlerSkip | null): HandlerSkip {
	expect(outcome?.kind).toBe("skipped");
	return outcome as HandlerSkip;
}

function asHandled(outcome: HandlerSuccess | HandlerSkip | null): HandlerSuccess {
	expect(outcome?.kind).toBe("handled");
	return outcome as HandlerSuccess;
}

/** handlers/ 全部源码文本：静态断言该层不依赖 fs，作为「不落盘」的证据。 */
function handlerSourceFiles(): Array<{ path: string; text: string }> {
	const walk = (dir: string): string[] =>
		readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
			entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
		);
	return walk(join(import.meta.dirname, "..", "..", "handlers"))
		.filter((path) => path.endsWith(".ts"))
		.map((path) => ({ path, text: readFileSync(path, "utf-8") }));
}

describe("github handler：gh 不可用", () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("gh 不在 PATH 时返回 skipped 并给出原因，且不发起任何 HTTP 请求", async () => {
		const calls: string[][] = [];
		const exec: GhExecutor = async (_command, args) => {
			calls.push(args);
			const error = new Error(`spawn ${_command} ENOENT`);
			(error as NodeJS.ErrnoException).code = "ENOENT";
			return { ok: false, stdout: "", stderr: "", error: error.message };
		};

		const skip = asSkip(await githubHandler.run(new URL("https://github.com/o/r"), baseContext({ execGh: exec })));

		expect(skip.handler).toBe("github");
		expect(skip.reason).toContain("gh");
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(calls.length).toBeGreaterThan(0);
	});

	it("gh 未登录时返回 skipped 并提示 gh auth login", async () => {
		const exec: GhExecutor = async (_command, args) => {
			if (args[0] === "--version") return ok("gh version 2.60.0");
			return { ok: false, stdout: "", stderr: "You are not logged into any GitHub hosts.", error: "exit 1" };
		};

		const skip = asSkip(await githubHandler.run(new URL("https://github.com/o/r"), baseContext({ execGh: exec })));

		expect(skip.reason).toContain("not authenticated");
		expect(skip.reason).toContain("gh auth login");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("探测期间被中断的失败结果不进缓存", async () => {
		const controller = new AbortController();
		let authProbes = 0;
		const exec: GhExecutor = async (_command, args, options) => {
			if (args[0] === "--version") return ok("gh version 2.60.0");
			if (args[0] === "auth") {
				authProbes += 1;
				if (options.signal?.aborted) return { ok: false, stdout: "", stderr: "", error: "The operation was aborted" };
				return ok("Logged in");
			}
			return ok(JSON.stringify(ISSUE));
		};

		controller.abort();
		const first = asSkip(
			await githubHandler.run(new URL("https://github.com/o/r/issues/7"), baseContext({ execGh: exec, signal: controller.signal })),
		);
		const second = asHandled(await githubHandler.run(new URL("https://github.com/o/r/issues/7"), baseContext({ execGh: exec })));

		expect(first.reason).toContain("not authenticated");
		expect(second.title).toContain("#7");
		expect(authProbes).toBe(2);
	});

	it("可用性探测只执行一次，后续调用走缓存", async () => {
		let probes = 0;
		const exec: GhExecutor = async (_command, args) => {
			if (args[0] === "--version" || args[0] === "auth") {
				probes += 1;
				return ok("");
			}
			return ok(JSON.stringify(ISSUE));
		};
		const ctx = baseContext({ execGh: exec });

		await githubHandler.run(new URL("https://github.com/o/r/issues/7"), ctx);
		await githubHandler.run(new URL("https://github.com/o/r/issues/7"), ctx);

		expect(probes).toBe(2);
	});

	it("handlers.github.enabled 为 false 时不探测也不执行", async () => {
		const calls: string[][] = [];
		const exec: GhExecutor = async (_command, args) => {
			calls.push(args);
			return ok("");
		};
		const ctx: HandlerContext = baseContext({
			execGh: exec,
			github: { enabled: false, command: "gh", timeoutMs: 10_000, maxChars: 150_000 },
		});

		const skip = asSkip(await githubHandler.run(new URL("https://github.com/o/r"), ctx));

		expect(skip.reason).toContain("enabled");
		expect(calls).toEqual([]);
	});
});

describe("github handler：gh 可用", () => {
	it("issue：调用 gh issue view 并渲染 markdown，不 clone 不落盘", async () => {
		const calls: string[][] = [];
		const exec: GhExecutor = async (_command, args) => {
			calls.push(args);
			if (args[0] === "--version") return ok("gh version 2.60.0");
			if (args[0] === "auth") return ok("Logged in to github.com account alice");
			return ok(JSON.stringify(ISSUE));
		};
		const result = asHandled(await githubHandler.run(new URL("https://github.com/o/r/issues/7"), baseContext({ execGh: exec })));

		expect(result.title).toContain("#7");
		expect(result.content).toContain("打开设置页就白屏。");
		expect(result.content).toContain("@bob");
		expect(calls[2]).toEqual(expect.arrayContaining(["issue", "view", "7", "--repo", "o/r"]));
		expect(calls.some((args) => args.includes("clone") || args.includes("git"))).toBe(false);
		const offenders = handlerSourceFiles()
			.filter((file) => /\bnode:fs\b|from\s+["']fs["']/.test(file.text))
			.map((file) => file.path);
		expect(offenders).toEqual([]);
	});

	it("gh 版本不认字段时回退 core 字段集", async () => {
		const calls: string[][] = [];
		let issueViews = 0;
		const exec: GhExecutor = async (_command, args) => {
			calls.push(args);
			if (args[0] === "--version") return ok("gh version 2.60.0");
			if (args[0] === "auth") return ok("Logged in");
			issueViews += 1;
			if (issueViews === 1) return { ok: false, stdout: "", stderr: "unknown JSON field: stateReason", error: "exit 1" };
			return ok(JSON.stringify(ISSUE));
		};

		const result = asHandled(await githubHandler.run(new URL("https://github.com/o/r/issues/7"), baseContext({ execGh: exec })));

		expect(issueViews).toBe(2);
		expect(calls[calls.length - 1]?.join(",")).not.toContain("stateReason");
		expect(result.content).toContain("崩溃：设置页空白");
	});

	it("主命令失败时返回 skipped 并带上 gh 的错误输出", async () => {
		const exec: GhExecutor = async (_command, args) => {
			if (args[0] === "--version") return ok("gh version 2.60.0");
			if (args[0] === "auth") return ok("Logged in");
			return { ok: false, stdout: "", stderr: "could not resolve to a Repository", error: "exit 1" };
		};

		const skip = asSkip(await githubHandler.run(new URL("https://github.com/o/r"), baseContext({ execGh: exec })));

		expect(skip.reason).toContain("could not resolve to a Repository");
	});
});

describe("execGh", () => {
	it("命令不存在时归一化为 ok: false，并带 ENOENT", async () => {
		const result = await execGh("gh-definitely-missing-xyz", ["--version"], {
			timeoutMs: 5_000,
			maxBuffer: GH_MAX_BUFFER,
			env: {},
		});

		expect(result.ok).toBe(false);
		expect(`${result.error ?? ""}${result.stderr}`).toMatch(/ENOENT/i);
	});
});

describe("ghEnv", () => {
	it("注入 GH_PROMPT_DISABLED / GIT_TERMINAL_PROMPT 与配置的代理", () => {
		const env = ghEnv("http://127.0.0.1:7890", {});

		expect(env.GH_PROMPT_DISABLED).toBe("1");
		expect(env.GIT_TERMINAL_PROMPT).toBe("0");
		expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
		expect(env.HTTP_PROXY).toBe("http://127.0.0.1:7890");
	});

	it("未配置代理时不注入代理变量", () => {
		const env = ghEnv(undefined, {});

		expect(env.HTTPS_PROXY).toBeUndefined();
		expect(env.HTTP_PROXY).toBeUndefined();
	});
});
