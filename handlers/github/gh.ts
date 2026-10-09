/** gh 子进程层：执行器、env 注入、`gh --version` + `gh auth status` 可用性探测（进程内缓存一次）。 */

import { execFile } from "node:child_process";
import type { GhExecResult, GhExecutor, GhRunOptions } from "../types.ts";

export const GH_MAX_BUFFER = 10 * 1024 * 1024;

/** 默认执行器：execFile 包装，把超时 / ENOENT / 非零退出统一成 `ok: false`。 */
export const execGh: GhExecutor = (command, args, options) =>
	new Promise((resolve) => {
		try {
			execFile(
				command,
				args,
				{
					timeout: options.timeoutMs,
					maxBuffer: options.maxBuffer,
					env: options.env,
					...(options.signal ? { signal: options.signal } : {}),
				},
				(err, stdout, stderr) => {
					const failure = err as NodeJS.ErrnoException | null;
					resolve({
						ok: !err,
						stdout,
						stderr,
						...(err ? { error: failure?.message ?? String(err) } : {}),
					});
				},
			);
		} catch (error) {
			// Windows 上 execFile 遇到 .cmd/.bat 会同步抛 EINVAL
			resolve({ ok: false, stdout: "", stderr: "", error: error instanceof Error ? error.message : String(error) });
		}
	});

/** gh 认这两个变量；github.com 不适用 localhost 绕过规则。 */
export function ghEnv(proxy: string | undefined, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...base, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" };
	if (proxy) {
		env.HTTPS_PROXY = proxy;
		env.HTTP_PROXY = proxy;
	}
	return env;
}

export interface GhAvailability {
	ok: boolean;
	/** `ok: false` 时的原因文本；`ok: true` 时为空串。 */
	reason: string;
}

interface ProbeOptions {
	exec: GhExecutor;
	timeoutMs: number;
	env: NodeJS.ProcessEnv;
	signal?: AbortSignal;
}

const probeCache = new Map<string, Promise<GhAvailability>>();

/** 进程内缓存一次 `gh --version` + `gh auth status`，不做逐 URL 探测。 */
export function checkGhAvailable(command: string, options: ProbeOptions): Promise<GhAvailability> {
	const cached = probeCache.get(command);
	if (cached) return cached;
	const probe = runProbe(command, options).then(
		(availability) => {
			// 探测期间被中断的失败结果不进缓存，否则一次 abort 会把失败固化到进程结束
			if (options.signal?.aborted) probeCache.delete(command);
			return availability;
		},
		(error: unknown) => {
			probeCache.delete(command);
			throw error;
		},
	);
	probeCache.set(command, probe);
	return probe;
}

/** 清空探测缓存；仅测试用。 */
export function resetGhProbeCache(): void {
	probeCache.clear();
}

async function runProbe(command: string, options: ProbeOptions): Promise<GhAvailability> {
	const version = await options.exec(command, ["--version"], runOptions(options));
	if (!version.ok) {
		return {
			ok: false,
			reason: `gh command not found (${command}): ${shortDetail(version)}. Install GitHub CLI or change handlers.github.command.`,
		};
	}
	const auth = await options.exec(command, ["auth", "status"], runOptions(options));
	if (!auth.ok) {
		return { ok: false, reason: `gh is not authenticated: ${shortDetail(auth)}. Run gh auth login first.` };
	}
	return { ok: true, reason: "" };
}

function runOptions(options: ProbeOptions): GhRunOptions {
	return { timeoutMs: options.timeoutMs, maxBuffer: GH_MAX_BUFFER, env: options.env, signal: options.signal };
}

/** 取错误输出首行并限长，用于原因文本。 */
export function shortDetail(result: GhExecResult): string {
	const line = (result.stderr || result.error || "").trim().split("\n")[0] ?? "";
	if (line === "") return "unknown error";
	return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}
