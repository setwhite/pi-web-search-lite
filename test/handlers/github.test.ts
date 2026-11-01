import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	execGh,
	GH_MAX_BUFFER,
	ghEnv,
	looksUnauthenticated,
	resetGhProbeCache,
} from "../../handlers/github/gh.ts";
import { githubHandler } from "../../handlers/github/index.ts";
import type {
	GhExecResult,
	GhExecutor,
	HandlerContext,
	HandlerOutcome,
	HandlerSkip,
	HandlerSuccess,
} from "../../handlers/types.ts";
import { baseContext, ghStub, ISSUE, RELEASE } from "./fixtures.ts";

beforeEach(() => resetGhProbeCache());

function ok(stdout: string): GhExecResult {
	return { ok: true, stdout, stderr: "" };
}

function asSkip(outcome: HandlerOutcome): HandlerSkip {
	expect(outcome?.kind).toBe("skipped");
	return outcome as HandlerSkip;
}

function asHandled(outcome: HandlerOutcome): HandlerSuccess {
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
		const stub = ghStub({
			version: { ok: false, stdout: "", stderr: "", error: "spawn gh ENOENT" },
		});

		const skip = asSkip(
			await githubHandler.run(
				new URL("https://github.com/o/r"),
				baseContext({ execGh: stub.exec }),
			),
		);

		expect(skip.handler).toBe("github");
		expect(skip.reason).toContain("gh");
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(stub.calls.length).toBeGreaterThan(0);
	});

	it("gh 未登录时返回 skipped 并提示 gh auth login", async () => {
		const stub = ghStub({
			auth: {
				ok: false,
				stdout: "",
				stderr: "You are not logged into any GitHub hosts.",
				error: "exit 1",
			},
		});

		const skip = asSkip(
			await githubHandler.run(
				new URL("https://github.com/o/r"),
				baseContext({ execGh: stub.exec }),
			),
		);

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
				if (options.signal?.aborted)
					return { ok: false, stdout: "", stderr: "", error: "The operation was aborted" };
				return ok("Logged in");
			}
			return ok(JSON.stringify(ISSUE));
		};

		controller.abort();
		const first = asSkip(
			await githubHandler.run(
				new URL("https://github.com/o/r/issues/7"),
				baseContext({ execGh: exec, signal: controller.signal }),
			),
		);
		const second = asHandled(
			await githubHandler.run(
				new URL("https://github.com/o/r/issues/7"),
				baseContext({ execGh: exec }),
			),
		);

		expect(first.reason).toContain("cannot reach GitHub");
		expect(second.title).toContain("#7");
		expect(authProbes).toBe(2);
	});

	it("可用性探测只执行一次，后续调用走缓存", async () => {
		const stub = ghStub({ reply: () => ok(JSON.stringify(ISSUE)) });
		const ctx = baseContext({ execGh: stub.exec });

		await githubHandler.run(new URL("https://github.com/o/r/issues/7"), ctx);
		await githubHandler.run(new URL("https://github.com/o/r/issues/7"), ctx);

		expect(stub.calls.map((args) => args[0])).toEqual(["--version", "auth", "issue", "issue"]);
	});

	it("handlers.github.enabled 为 false 时不探测也不执行", async () => {
		const stub = ghStub();
		const ctx: HandlerContext = baseContext({
			execGh: stub.exec,
			github: { enabled: false, command: "gh", timeoutMs: 10_000, maxChars: 150_000 },
		});

		const skip = asSkip(await githubHandler.run(new URL("https://github.com/o/r"), ctx));

		expect(skip.reason).toContain("enabled");
		expect(stub.calls).toEqual([]);
	});
});

describe("github handler：代理与探测失败", () => {
	it("带代理探不通时改用直连，业务命令也走直连", async () => {
		const envs: NodeJS.ProcessEnv[] = [];
		const exec: GhExecutor = async (_command, args, options) => {
			envs.push(options.env);
			if (args[0] === "--version") return ok("gh version 2.60.0");
			if (args[0] === "auth") {
				return options.env.HTTPS_PROXY === undefined
					? ok("Logged in")
					: { ok: false, stdout: "", stderr: "error connecting to api.github.com", error: "" };
			}
			return options.env.HTTPS_PROXY === undefined
				? ok(JSON.stringify(ISSUE))
				: { ok: false, stdout: "", stderr: "", error: "业务命令不该走代理" };
		};

		const handled = asHandled(
			await githubHandler.run(
				new URL("https://github.com/o/r/issues/7"),
				baseContext({ execGh: exec, proxy: "http://127.0.0.1:7890" }),
			),
		);

		expect(handled.title).toContain("#7");
		// 前两次是带代理的探测，第三、四次是直连探测，第五次是业务命令
		expect(envs).toHaveLength(5);
		expect(envs.slice(0, 2).map((env) => env.HTTPS_PROXY)).toEqual([
			"http://127.0.0.1:7890",
			"http://127.0.0.1:7890",
		]);
		expect(envs[4]?.HTTPS_PROXY).toBeUndefined();
	});

	it("代理让 gh 误报「token 无效」时，直连复核后照常处理", async () => {
		const exec: GhExecutor = async (_command, args, options) => {
			if (args[0] === "--version") return ok("gh version 2.60.0");
			if (args[0] === "auth") {
				// 实测：代理不通时 gh 就是这样一句，把网络故障说成凭据失效
				return options.env.HTTPS_PROXY === undefined
					? ok("Logged in")
					: {
							ok: false,
							stdout: "",
							stderr:
								"github.com\n  X Failed to log in to github.com account me (keyring)\n  - The token in keyring is invalid.",
							error: "exit 1",
						};
			}
			return options.env.HTTPS_PROXY === undefined
				? ok(JSON.stringify(ISSUE))
				: { ok: false, stdout: "", stderr: "", error: "业务命令不该走代理" };
		};

		const handled = asHandled(
			await githubHandler.run(
				new URL("https://github.com/o/r/issues/7"),
				baseContext({ execGh: exec, proxy: "http://127.0.0.1:7890" }),
			),
		);

		expect(handled.title).toContain("#7");
	});

	it("网络故障不缓存：下一次仍然重新探测，原因不谎报未登录", async () => {
		let authProbes = 0;
		const exec: GhExecutor = async (_command, args) => {
			if (args[0] === "--version") return ok("gh version 2.60.0");
			authProbes += 1;
			return {
				ok: false,
				stdout: "",
				stderr: "dial tcp 140.82.112.6:443: i/o timeout",
				error: "exit 1",
			};
		};
		const ctx = baseContext({ execGh: exec });

		const first = asSkip(await githubHandler.run(new URL("https://github.com/o/r"), ctx));
		const second = asSkip(await githubHandler.run(new URL("https://github.com/o/r"), ctx));

		expect(first.reason).toContain("cannot reach GitHub");
		expect(first.reason).not.toContain("not authenticated");
		expect(second.reason).toContain("cannot reach GitHub");
		expect(authProbes).toBe(2);
	});

	it("未登录是定论，会被缓存", async () => {
		const stub = ghStub({
			auth: {
				ok: false,
				stdout: "",
				stderr: "You are not logged into any GitHub hosts.",
				error: "",
			},
		});
		const ctx = baseContext({ execGh: stub.exec });

		const first = asSkip(await githubHandler.run(new URL("https://github.com/o/r"), ctx));
		await githubHandler.run(new URL("https://github.com/o/r"), ctx);

		expect(first.reason).toContain("not authenticated");
		expect(stub.calls.map((args) => args[0])).toEqual(["--version", "auth"]);
	});
});

describe("github handler：gh 可用", () => {
	it("issue：调用 gh issue view 并渲染 markdown，不 clone 不落盘", async () => {
		const stub = ghStub({ reply: () => ok(JSON.stringify(ISSUE)) });
		const result = asHandled(
			await githubHandler.run(
				new URL("https://github.com/o/r/issues/7"),
				baseContext({ execGh: stub.exec }),
			),
		);

		expect(result.title).toContain("#7");
		expect(result.content).toContain("打开设置页就白屏。");
		expect(result.content).toContain("@bob");
		expect(stub.calls[2]).toEqual(expect.arrayContaining(["issue", "view", "7", "--repo", "o/r"]));
		expect(stub.calls.some((args) => args.includes("clone") || args.includes("git"))).toBe(false);
		const offenders = handlerSourceFiles()
			.filter((file) => /\bnode:fs\b|from\s+["']fs["']/.test(file.text))
			.map((file) => file.path);
		expect(offenders).toEqual([]);
	});

	it("release：tag 走 -- 分界，不被 gh 当开关解析", async () => {
		const stub = ghStub({ reply: () => ok(JSON.stringify(RELEASE)) });
		const result = asHandled(
			await githubHandler.run(
				new URL("https://github.com/o/r/releases/tag/--repo"),
				baseContext({ execGh: stub.exec }),
			),
		);
		const args = stub.calls[2] ?? [];

		expect(args.slice(0, 2)).toEqual(["release", "view"]);
		expect(args).toContain("--json");
		expect(args.at(-2)).toBe("--");
		expect(args.at(-1)).toBe("--repo");
		expect(result.content).toContain("修复若干问题");
	});

	it("gh 版本不认字段时回退 core 字段集", async () => {
		let issueViews = 0;
		const stub = ghStub({
			reply: () => {
				issueViews += 1;
				if (issueViews === 1)
					return {
						ok: false,
						stdout: "",
						stderr: "unknown JSON field: stateReason",
						error: "exit 1",
					};
				return ok(JSON.stringify(ISSUE));
			},
		});

		const result = asHandled(
			await githubHandler.run(
				new URL("https://github.com/o/r/issues/7"),
				baseContext({ execGh: stub.exec }),
			),
		);

		expect(issueViews).toBe(2);
		expect(stub.calls.at(-1)?.join(",")).not.toContain("stateReason");
		expect(result.content).toContain("崩溃：设置页空白");
	});

	it("主命令失败时返回 skipped 并带上 gh 的错误输出", async () => {
		const stub = ghStub({
			reply: () => ({
				ok: false,
				stdout: "",
				stderr: "could not resolve to a Repository",
				error: "exit 1",
			}),
		});

		const skip = asSkip(
			await githubHandler.run(
				new URL("https://github.com/o/r"),
				baseContext({ execGh: stub.exec }),
			),
		);

		expect(skip.reason).toContain("could not resolve to a Repository");
	});
});

describe("looksUnauthenticated", () => {
	it("认明确的未登录，不认网络故障", () => {
		expect(looksUnauthenticated("You are not logged into any GitHub hosts.")).toBe(true);
		expect(looksUnauthenticated("HTTP 401: Bad credentials")).toBe(true);
		// 实测代理不通时的原话：形状像认证失败，所以带代理的探测结果不能当定论
		expect(looksUnauthenticated("The token in keyring is invalid.")).toBe(true);
		expect(
			looksUnauthenticated("error connecting to api.github.com: check your internet connection"),
		).toBe(false);
		expect(looksUnauthenticated("dial tcp 140.82.112.6:443: i/o timeout")).toBe(false);
		expect(looksUnauthenticated("The operation was aborted")).toBe(false);
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
