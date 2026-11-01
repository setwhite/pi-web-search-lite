/**
 * 出站 HTTP 唯一出口：代理及其回退、超时、UA、AbortSignal、错误归一化。
 * 不认 provider 语义；入口 URL 的 SSRF 校验由调用方在抓取前完成，
 * 本模块只对重定向的每一跳目标调用 `assertPublicUrl`。
 * 代理可用性状态与降级提示在 `route.ts`，本模块只负责按判定发起尝试。
 */

import {
	type Dispatcher,
	ProxyAgent,
	type Response as UndiciResponse,
	fetch as undiciFetch,
} from "undici";
import { assertPublicUrl, isLoopbackHost, SsrfError } from "../ssrf/index.ts";
import {
	proxyNotice,
	recordProxyFailure,
	recordProxySuccess,
	resetProxyRoute,
	useProxy,
} from "./route.ts";

export { proxyNotice, resetProxyRoute };

export type HttpErrorType =
	| "timeout"
	| "abort"
	| "http_status"
	| "parse"
	| "network"
	| "redirect"
	| "too_many_redirects";

/** 结构化 HTTP 错误；模型可见文案由 tools/ 组装。 */
export class HttpError extends Error {
	readonly type: HttpErrorType;
	readonly url: string;
	// status / body 只为诊断与测试保留：模型可见文案由上层从 message 组装，不读这两个字段，别在它们上面加依赖
	readonly status: number | undefined;
	readonly body: string | undefined;

	constructor(
		type: HttpErrorType,
		url: string,
		message: string,
		extra: { status?: number; body?: string } = {},
	) {
		super(message);
		this.name = "HttpError";
		this.type = type;
		this.url = url;
		this.status = extra.status;
		this.body = extra.body;
	}
}

export interface HttpClientOptions {
	/** `undefined` 或空字符串 = 直连；只支持 http/https（配置层已校验）。 */
	proxy: string | undefined;
	timeoutMs: number;
	userAgent: string;
	/** 测试注入；缺省读系统时钟（代理冷却计时用）。 */
	now?: () => number;
	/** 测试注入；缺省用 undici 的 `fetch`。 */
	fetchImpl?: typeof undiciFetch;
}

export interface HttpRequest {
	method?: "GET" | "POST";
	headers?: Record<string, string>;
	body?: string;
	signal?: AbortSignal;
}

export interface HttpTextResult {
	status: number;
	url: string;
	contentType: string | undefined;
	text: string;
}

export interface HttpJsonResult<T> {
	status: number;
	url: string;
	contentType: string | undefined;
	data: T;
}

export interface HttpClient {
	fetchText(url: string, request?: HttpRequest): Promise<HttpTextResult>;
	fetchJson<T>(url: string, request?: HttpRequest): Promise<HttpJsonResult<T>>;
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** cause 链展开深度上限：undici 的套娃一般 2–3 层（TypeError → AggregateError → Error）。 */
const MAX_CAUSE_DEPTH = 4;

interface RequestState {
	method: string;
	userSignal: AbortSignal | undefined;
	timeout: AbortSignal;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
	const clock = options.now ?? Date.now;
	const send = options.fetchImpl ?? undiciFetch;
	let proxyAgent: ProxyAgent | undefined;

	/** 本机目标永远绕过代理；其余目标在配置了 proxy 时经同一个 ProxyAgent。 */
	function dispatcherFor(url: URL, viaProxy: boolean): Dispatcher | undefined {
		if (!viaProxy) return undefined;
		if (options.proxy === undefined || options.proxy === "") return undefined;
		if (isLoopbackHost(url.hostname)) return undefined;
		proxyAgent ??= new ProxyAgent({ uri: options.proxy });
		return proxyAgent;
	}

	/** 入口目标是否走代理：本机目标与冷却期内都直接连。 */
	function entryUsesProxy(url: URL): boolean {
		if (options.proxy === undefined || options.proxy === "") return false;
		if (isLoopbackHost(url.hostname)) return false;
		return useProxy(options.proxy, clock());
	}

	/** 一次传输尝试：独立的 timeout 信号与错误归一化状态，代理与否由 `viaProxy` 决定。 */
	async function attempt(
		url: string,
		request: HttpRequest | undefined,
		viaProxy: boolean,
	): Promise<{ response: UndiciResponse; finalUrl: string; state: RequestState }> {
		const state: RequestState = {
			method: request?.method ?? "GET",
			userSignal: request?.signal,
			timeout: AbortSignal.timeout(options.timeoutMs),
		};
		const signal =
			state.userSignal === undefined
				? state.timeout
				: AbortSignal.any([state.userSignal, state.timeout]);
		const { response, finalUrl } = await perform(url, request, state, signal, viaProxy);
		return { response, finalUrl, state };
	}

	/**
	 * 有代理先走代理；传输层失败（network / timeout）换直连再试一次，并记一次代理失败。
	 * 回退只发生在还没拿到响应时：拿到响应之后的读体失败重发会重复副作用，所以不回退。
	 */
	async function exchange(
		url: string,
		request: HttpRequest | undefined,
	): Promise<{ response: UndiciResponse; finalUrl: string; state: RequestState }> {
		if (entryUsesProxy(new URL(url))) {
			try {
				const done = await attempt(url, request, true);
				recordProxySuccess(options.proxy);
				return done;
			} catch (error) {
				if (!isTransportFailure(error)) throw error;
				recordProxyFailure(options.proxy, error.type, clock());
			}
		}
		return attempt(url, request, false);
	}

	async function readResult(
		url: string,
		request: HttpRequest | undefined,
	): Promise<{ status: number; url: string; contentType: string | undefined; text: string }> {
		const { response, finalUrl, state } = await exchange(url, request);

		let text: string;
		try {
			text = await response.text();
		} catch (cause) {
			throw toHttpError(cause, finalUrl, state);
		}

		if (!response.ok) {
			throw new HttpError(
				"http_status",
				finalUrl,
				`HTTP ${response.status}: ${state.method} ${finalUrl}`,
				{
					status: response.status,
					body: text,
				},
			);
		}
		return {
			status: response.status,
			url: finalUrl,
			contentType: response.headers.get("content-type") ?? undefined,
			text,
		};
	}

	return {
		async fetchText(url: string, request?: HttpRequest): Promise<HttpTextResult> {
			return readResult(url, request);
		},

		async fetchJson<T>(url: string, request?: HttpRequest): Promise<HttpJsonResult<T>> {
			const result = await readResult(url, request);
			try {
				return { ...result, data: JSON.parse(result.text) as T };
			} catch {
				throw new HttpError(
					"parse",
					result.url,
					`invalid JSON response: ${request?.method ?? "GET"} ${result.url}`,
				);
			}
		},
	};

	/** 执行请求并跟随重定向；每一跳目标都经 SSRF 静态校验。 */
	async function perform(
		url: string,
		request: HttpRequest | undefined,
		state: RequestState,
		signal: AbortSignal,
		viaProxy: boolean,
	): Promise<{ response: UndiciResponse; finalUrl: string }> {
		let current = new URL(url);
		let method = state.method;
		let body = request?.body;
		const headers: Record<string, string> = {
			...request?.headers,
			"user-agent": options.userAgent,
		};

		for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
			let response: UndiciResponse;
			try {
				response = await send(current, {
					method,
					headers,
					body,
					signal,
					redirect: "manual",
					dispatcher: dispatcherFor(current, viaProxy),
				});
			} catch (cause) {
				throw toHttpError(cause, current.href, state);
			}

			const location = response.headers.get("location");
			if (!REDIRECT_STATUSES.has(response.status) || location === null) {
				return { response, finalUrl: current.href };
			}

			await response.body?.cancel().catch(() => undefined); // 尽力释放连接，失败不影响重定向
			const next = redirectTarget(current, location);
			if (next.origin !== current.origin) dropSensitiveHeaders(headers);
			if (
				response.status === 303 ||
				((response.status === 301 || response.status === 302) &&
					method !== "GET" &&
					method !== "HEAD")
			) {
				method = "GET";
				body = undefined;
			}
			current = next;
		}
		throw new HttpError(
			"too_many_redirects",
			current.href,
			`too many redirects (limit ${MAX_REDIRECTS}): ${url}`,
		);
	}
}

/** 解析并校验重定向目标：非法 URL 抛 HttpError，SSRF 命中抛 SsrfError。 */
function redirectTarget(current: URL, location: string): URL {
	let next: URL;
	try {
		next = new URL(location, current);
	} catch {
		throw new HttpError(
			"redirect",
			current.href,
			`invalid redirect target: ${location} (from ${current.href})`,
		);
	}
	assertPublicUrl(next.href);
	return next;
}

/** 只有传输层失败才换直连；调用方中断、SSRF 命中与 HTTP 状态码都不是代理的错。 */
function isTransportFailure(error: unknown): error is HttpError {
	return error instanceof HttpError && (error.type === "network" || error.type === "timeout");
}

/** 归一化 fetch / 读体阶段的异常：区分调用方中断、超时与网络错误。 */
function toHttpError(cause: unknown, url: string, state: RequestState): HttpError | SsrfError {
	if (cause instanceof HttpError || cause instanceof SsrfError) return cause;
	if (state.userSignal?.aborted === true)
		return new HttpError("abort", url, `request aborted: ${state.method} ${url}`);
	if (state.timeout.aborted)
		return new HttpError("timeout", url, `request timed out: ${state.method} ${url}`);
	const detail = describeCause(cause);
	return new HttpError("network", url, `network error: ${state.method} ${url}: ${detail}`);
}

/**
 * 展开 cause 链拼出网络错误的原因。
 * undici 外层固定是 "fetch failed"（零信息量），真正的病名在里层：bad port / ECONNREFUSED / ENOTFOUND；
 * 多地址场景里再套一层 AggregateError（自身 message 可能是空串），所以逐层收 code 与 message 并按序去重。
 */
function describeCause(cause: unknown): string {
	const details = new Set<string>();
	const walk = (node: unknown, depth: number): void => {
		if (depth > MAX_CAUSE_DEPTH || node === undefined || node === null) return;
		if (typeof node !== "object") {
			details.add(String(node));
			return;
		}
		const {
			name,
			message,
			code,
			errors,
			cause: nested,
		} = node as {
			name?: unknown;
			message?: unknown;
			code?: unknown;
			errors?: unknown;
			cause?: unknown;
		};
		const text = typeof message === "string" ? message.trim() : "";
		const tag = typeof code === "string" ? code : "";
		if (text !== "" && tag !== "") details.add(text.includes(tag) ? text : `${tag}: ${text}`);
		else if (text !== "") details.add(text);
		else if (tag !== "") details.add(tag);
		else if (typeof name === "string" && name !== "Error") details.add(name);
		if (Array.isArray(errors)) for (const inner of errors) walk(inner, depth + 1);
		walk(nested, depth + 1);
	};
	walk(cause, 0);
	return details.size === 0 ? String(cause) : [...details].join("; ");
}

/**
 * 认证头按名字族判定：枚举具体头名会在下一家 provider 再漏（brave 用的是 `x-subscription-token`）；
 * 跨 origin 时多摘一个非认证头无害，漏摘 key 才是事故，所以宁可放宽。
 * 只收本仓库真的会发出去的凭据头——cookie / proxy-authorization 没有调用点，不进表。
 */
function isSensitiveHeader(name: string): boolean {
	const lower = name.toLowerCase();
	return (
		lower === "authorization" ||
		lower.endsWith("token") ||
		lower.endsWith("api-key") ||
		lower.endsWith("api_key") ||
		lower.endsWith("apikey")
	);
}

/** 跨 origin 重定向前摘认证头：目标域不该拿到只该发给来源域的凭据。 */
function dropSensitiveHeaders(headers: Record<string, string>): void {
	for (const key of Object.keys(headers)) {
		if (isSensitiveHeader(key)) delete headers[key];
	}
}
