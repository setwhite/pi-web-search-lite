/** gh 子进程层：执行器、env 注入、`gh --version` + `gh auth status` 可用性探测（按 command + proxy 进程内缓存一次）。 */

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
			resolve({
				ok: false,
				stdout: "",
				stderr: "",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});

/** gh 认这两个变量；github.com 不适用 localhost 绕过规则。 */
export function ghEnv(
	proxy: string | undefined,
	base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...base, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" };
	if (proxy) {
		env.HTTPS_PROXY = proxy;
		env.HTTP_PROXY = proxy;
	}
	return env;
}

/** `ok: true` 时带上探测走通的那条路的 env，业务命令必须用同一份。 */
export type GhAvailability = { ok: true; env: NodeJS.ProcessEnv } | { ok: false; reason: string };

interface ProbeOptions {
	exec: GhExecutor;
	timeoutMs: number;
	/** 配置的代理；探测先带它，失败再去掉它复核一次。 */
	proxy?: string;
	signal?: AbortSignal;
}

/** not-found / auth 是定论；transport 不是——一次网络故障不该把本会话的 GitHub 处理锁死。 */
interface ProbeFailure {
	kind: "not-found" | "auth" | "transport";
	reason: string;
}

const probeCache = new Map<string, Promise<GhAvailability>>();

/** 进程内缓存一次探测，不做逐 URL 探测；缓存键带代理，代理换了就是另一条路。 */
export function checkGhAvailable(command: string, options: ProbeOptions): Promise<GhAvailability> {
	const key = `${command}\u0000${options.proxy ?? ""}`;
	const cached = probeCache.get(key);
	if (cached) return cached;
	const probe = runProbe(command, options).then(
		({ availability, cache }) => {
			if (!cache) probeCache.delete(key);
			return availability;
		},
		(error: unknown) => {
			probeCache.delete(key);
			throw error;
		},
	);
	probeCache.set(key, probe);
	return probe;
}

/** 清空探测缓存；仅测试用。 */
export function resetGhProbeCache(): void {
	probeCache.clear();
}

/**
 * 直连复核只给短预算：这一步是为了分清真故障与代理的假象，不该再花一份完整超时。
 * 实测代理不通时 gh 会报「The token in keyring is invalid.」——把网络故障说成凭据失效。
 */
const RECHECK_TIMEOUT_MS = 5_000;

/**
 * 先带代理探一次，失败再去掉代理复核一次；走通的那条路的 env 交给业务命令。
 * 代理在中间时任何结论都要直连复核：gh 自己会把「连不上」说成「token 无效」，只有直连的 auth 结论才可信。
 */
async function runProbe(
	command: string,
	options: ProbeOptions,
): Promise<{ availability: GhAvailability; cache: boolean }> {
	let last: ProbeFailure | undefined;
	for (const attempt of probeAttempts(options)) {
		const env = ghEnv(attempt.proxy);
		const outcome = await probeOnce(command, env, { ...options, timeoutMs: attempt.timeoutMs });
		if (!("kind" in outcome)) return { availability: { ok: true, env }, cache: true };
		// 本地二进制缺失与代理无关，谁探都一样
		if (outcome.kind === "not-found") {
			return { availability: { ok: false, reason: outcome.reason }, cache: true };
		}
		last = outcome;
	}
	return {
		availability: { ok: false, reason: last?.reason ?? `gh probe failed: ${command}` },
		cache: last?.kind === "auth",
	};
}

function probeAttempts(
	options: ProbeOptions,
): Array<{ proxy: string | undefined; timeoutMs: number }> {
	if (options.proxy === undefined) return [{ proxy: undefined, timeoutMs: options.timeoutMs }];
	return [
		{ proxy: options.proxy, timeoutMs: options.timeoutMs },
		{ proxy: undefined, timeoutMs: Math.min(options.timeoutMs, RECHECK_TIMEOUT_MS) },
	];
}

async function probeOnce(
	command: string,
	env: NodeJS.ProcessEnv,
	options: ProbeOptions,
): Promise<{ ok: true } | ProbeFailure> {
	const version = await options.exec(command, ["--version"], runOptions(env, options));
	if (!version.ok) {
		return {
			kind: "not-found",
			reason: `gh command not found (${command}): ${shortDetail(version)}. Install GitHub CLI or change handlers.github.command.`,
		};
	}
	const auth = await options.exec(command, ["auth", "status"], runOptions(env, options));
	if (auth.ok) return { ok: true };
	const lines = failureLines(auth);
	const authLine = lines.find((line) => looksUnauthenticated(line));
	if (authLine !== undefined) {
		return {
			kind: "auth",
			reason: `gh is not authenticated: ${authLine}. Run gh auth login first.`,
		};
	}
	return {
		kind: "transport",
		reason: `gh cannot reach GitHub: ${lines[0] ?? shortDetail(auth)}. Check the network or config.proxy.`,
	};
}

/** gh 的多行输出常以主机名开头；跳过无信息行，留下能当原因用的那几行。 */
function failureLines(result: GhExecResult): string[] {
	return `${result.stderr}\n${result.error ?? ""}`
		.split("\n")
		.map((line) => line.trim().replace(/^[-X!]\s+/, ""))
		.filter((line) => line !== "" && !/^[A-Za-z0-9.-]+$/.test(line));
}

/**
 * 只认明确的未登录证据：网络故障的 stderr 与认证失败没有共同关键词，
 * 认不出来就归传输层（可重试、不缓存），不把「网络不通」说成「没登录」。
 */
export function looksUnauthenticated(detail: string): boolean {
	return /not logged in|not logged into|not authenticated|bad credentials|authentication failed|token[^.\n]{0,40}(?:invalid|expired)|HTTP 40[13]/i.test(
		detail,
	);
}

function runOptions(env: NodeJS.ProcessEnv, options: ProbeOptions): GhRunOptions {
	return {
		timeoutMs: options.timeoutMs,
		maxBuffer: GH_MAX_BUFFER,
		env,
		signal: options.signal,
	};
}

/** 取错误输出首行并限长，用于原因文本。 */
export function shortDetail(result: GhExecResult): string {
	const line = (result.stderr || result.error || "").trim().split("\n")[0] ?? "";
	if (line === "") return "unknown error";
	return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}
