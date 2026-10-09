/**
 * 出站 HTTP 唯一出口：代理、超时、UA、AbortSignal、错误归一化。
 * 不认 provider 语义；入口 URL 的 SSRF 校验由调用方在抓取前完成，
 * 本模块只对重定向的每一跳目标调用 `assertPublicUrl`。
 */

import { fetch as undiciFetch, ProxyAgent, type Dispatcher, type Response as UndiciResponse } from "undici";
import { assertPublicUrl, isLoopbackHost, SsrfError } from "../ssrf/index.ts";

export type HttpErrorType = "timeout" | "abort" | "http_status" | "parse" | "network" | "redirect" | "too_many_redirects";

/** 结构化 HTTP 错误；模型可见文案由 tools/ 组装。 */
export class HttpError extends Error {
	readonly type: HttpErrorType;
	readonly url: string;
	readonly status: number | undefined;
	readonly body: string | undefined;

	constructor(type: HttpErrorType, url: string, message: string, extra: { status?: number; body?: string } = {}) {
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

interface RequestState {
	method: string;
	userSignal: AbortSignal | undefined;
	timeout: AbortSignal;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
	let proxyAgent: ProxyAgent | undefined;

	/** 本机目标永远绕过代理；其余目标在配置了 proxy 时经同一个 ProxyAgent。 */
	function dispatcherFor(url: URL): Dispatcher | undefined {
		if (options.proxy === undefined || options.proxy === "") return undefined;
		if (isLoopbackHost(url.hostname)) return undefined;
		proxyAgent ??= new ProxyAgent({ uri: options.proxy });
		return proxyAgent;
	}

	async function readResult(
		url: string,
		request: HttpRequest | undefined,
	): Promise<{ status: number; url: string; contentType: string | undefined; text: string }> {
		const state: RequestState = {
			method: request?.method ?? "GET",
			userSignal: request?.signal,
			timeout: AbortSignal.timeout(options.timeoutMs),
		};
		const signal = state.userSignal === undefined ? state.timeout : AbortSignal.any([state.userSignal, state.timeout]);
		const { response, finalUrl } = await perform(url, request, state, signal);

		let text: string;
		try {
			text = await response.text();
		} catch (cause) {
			throw toHttpError(cause, finalUrl, state);
		}

		if (!response.ok) {
			throw new HttpError("http_status", finalUrl, `HTTP ${response.status}: ${state.method} ${finalUrl}`, {
				status: response.status,
				body: text,
			});
		}
		return { status: response.status, url: finalUrl, contentType: response.headers.get("content-type") ?? undefined, text };
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
				throw new HttpError("parse", result.url, `invalid JSON response: ${request?.method ?? "GET"} ${result.url}`);
			}
		},
	};

	/** 执行请求并跟随重定向；每一跳目标都经 SSRF 静态校验。 */
	async function perform(
		url: string,
		request: HttpRequest | undefined,
		state: RequestState,
		signal: AbortSignal,
	): Promise<{ response: UndiciResponse; finalUrl: string }> {
		let current = new URL(url);
		let method = state.method;
		let body = request?.body;
		const headers: Record<string, string> = { ...request?.headers, "user-agent": options.userAgent };

		for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
			let response: UndiciResponse;
			try {
				response = await undiciFetch(current, {
					method,
					headers,
					body,
					signal,
					redirect: "manual",
					dispatcher: dispatcherFor(current),
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
			if (next.origin !== current.origin) dropHeader(headers, "authorization");
			if (response.status === 303 || ((response.status === 301 || response.status === 302) && method !== "GET" && method !== "HEAD")) {
				method = "GET";
				body = undefined;
			}
			current = next;
		}
		throw new HttpError("too_many_redirects", current.href, `too many redirects (limit ${MAX_REDIRECTS}): ${url}`);
	}
}

/** 解析并校验重定向目标：非法 URL 抛 HttpError，SSRF 命中抛 SsrfError。 */
function redirectTarget(current: URL, location: string): URL {
	let next: URL;
	try {
		next = new URL(location, current);
	} catch {
		throw new HttpError("redirect", current.href, `invalid redirect target: ${location} (from ${current.href})`);
	}
	assertPublicUrl(next.href);
	return next;
}

/** 归一化 fetch / 读体阶段的异常：区分调用方中断、超时与网络错误。 */
function toHttpError(cause: unknown, url: string, state: RequestState): HttpError | SsrfError {
	if (cause instanceof HttpError || cause instanceof SsrfError) return cause;
	if (state.userSignal?.aborted === true) return new HttpError("abort", url, `request aborted: ${state.method} ${url}`);
	if (state.timeout.aborted) return new HttpError("timeout", url, `request timed out: ${state.method} ${url}`);
	const detail = cause instanceof Error ? cause.message : String(cause);
	return new HttpError("network", url, `network error: ${state.method} ${url}: ${detail}`);
}

function dropHeader(headers: Record<string, string>, name: string): void {
	for (const key of Object.keys(headers)) {
		if (key.toLowerCase() === name) delete headers[key];
	}
}
