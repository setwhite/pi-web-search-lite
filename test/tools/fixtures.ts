/** tools 层测试共享：默认配置构造、HttpClient 桩与小工具。所有用例不打真实网络。 */

import { join } from "node:path";
import {
	loadConfig,
	type ContextSettings,
	type FetchSettings,
	type GitHubHandlerSettings,
	type GuidanceFields,
	type ProviderId,
	type ResolvedConfig,
	type SearchSettings,
	type ToolId,
	type ToolSettings,
} from "../../config/index.ts";
import type { HttpClient, HttpJsonResult, HttpRequest, HttpTextResult } from "../../http/index.ts";

export interface ConfigOverrides {
	provider?: ProviderId;
	apiKeys?: Partial<Record<ProviderId, string>>;
	proxy?: string;
	timeoutMs?: number;
	userAgent?: string;
	tools?: Partial<Record<ToolId, ToolSettings>>;
	activation?: "eager" | "deferred";
	guidance?: Partial<Record<ToolId, GuidanceFields>>;
	context?: Partial<ContextSettings>;
	search?: Partial<SearchSettings>;
	fetch?: Partial<FetchSettings>;
	handlers?: { github?: Partial<GitHubHandlerSettings> };
}

/** 全默认配置 + 逐块合并覆盖；configPath 指向不存在的文件，env 为空。 */
export function makeConfig(overrides: ConfigOverrides = {}): ResolvedConfig {
	const base = loadConfig({ configPath: join(process.cwd(), "test", ".no-such-config.json"), env: {} });
	return {
		...base,
		...overrides,
		apiKeys: { ...base.apiKeys, ...overrides.apiKeys },
		tools: { ...base.tools, ...overrides.tools },
		guidance: { ...base.guidance, ...overrides.guidance },
		context: { ...base.context, ...overrides.context },
		search: { ...base.search, ...overrides.search },
		fetch: { ...base.fetch, ...overrides.fetch },
		handlers: { github: { ...base.handlers.github, ...overrides.handlers?.github } },
	};
}

export interface StubReply {
	status?: number;
	contentType?: string;
	text: string;
}

export interface HttpCall {
	method: "text" | "json";
	url: string;
	body: string | undefined;
}

export interface FakeHttp extends HttpClient {
	readonly calls: HttpCall[];
}

/** 记录每次调用并按 handler 回复的 HttpClient 桩。 */
export function fakeHttp(handler: (url: string, body: string | undefined) => StubReply): FakeHttp {
	const calls: HttpCall[] = [];
	const client: HttpClient = {
		async fetchText(url: string, request?: HttpRequest): Promise<HttpTextResult> {
			calls.push({ method: "text", url, body: request?.body });
			const reply = handler(url, request?.body);
			return { status: reply.status ?? 200, url, contentType: reply.contentType ?? "text/html", text: reply.text };
		},
		async fetchJson<T>(url: string, request?: HttpRequest): Promise<HttpJsonResult<T>> {
			calls.push({ method: "json", url, body: request?.body });
			const reply = handler(url, request?.body);
			return {
				status: reply.status ?? 200,
				url,
				contentType: reply.contentType ?? "application/json",
				data: JSON.parse(reply.text) as T,
			};
		},
	};
	return Object.assign(client, { calls });
}

/** 取工具结果里的第一段文本。 */
export function firstText(result: { content: Array<{ type: string }> }): string {
	return (result.content[0] as { type: string; text?: string } | undefined)?.text ?? "";
}

/** 断言 promise 抛错并返回错误对象。 */
export async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
	try {
		await promise;
	} catch (error) {
		return error as Error;
	}
	throw new Error("预期抛错但成功返回");
}
