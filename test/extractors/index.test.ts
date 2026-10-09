import { describe, expect, it, vi } from "vitest";
import type { ExtractorId } from "../../config/index.ts";
import { EXTRACTORS, ExtractError, extractWithChain } from "../../extractors/index.ts";
import type { ExtractedContent, Extractor, ExtractorContext } from "../../extractors/types.ts";
import type { HttpClient } from "../../http/index.ts";
import { createHttpClient } from "../../http/index.ts";

function baseContext(overrides: Partial<ExtractorContext> = {}): ExtractorContext {
	return {
		http: createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" }),
		apiKeys: {},
		minChars: 200,
		maxCharsPerPage: 150_000,
		...overrides,
	};
}

interface FakeSpec {
	skipped?: string;
	content?: string;
	error?: string;
	title?: string;
}

function fake(id: ExtractorId, spec: FakeSpec) {
	let calls = 0;
	const extractor: Extractor = {
		id,
		unavailableReason: () => spec.skipped ?? null,
		async extract(url): Promise<ExtractedContent> {
			calls += 1;
			if (spec.error) throw new Error(spec.error);
			return { url, title: spec.title, content: spec.content ?? "" };
		},
	};
	return { extractor, calls: () => calls };
}

function table(...items: Array<{ extractor: Extractor }>): Record<ExtractorId, Extractor> {
	const result = { ...EXTRACTORS };
	for (const item of items) result[item.extractor.id] = item.extractor;
	return result;
}

async function failureOf(promise: Promise<unknown>): Promise<ExtractError> {
	try {
		await promise;
		throw new Error("预期抛错但成功返回");
	} catch (error) {
		expect(error).toBeInstanceOf(ExtractError);
		return error as ExtractError;
	}
}

describe("extractWithChain", () => {
	it("内置五家齐全", () => {
		expect(Object.keys(EXTRACTORS).sort()).toEqual(["exa", "firecrawl", "html", "jina", "tavily"]);
	});

	it("未配 key 的提取器跳过且不发任何请求", async () => {
		const fetchJson = vi.fn();
		const fetchText = vi.fn();
		const http = { fetchJson, fetchText } as unknown as HttpClient;

		const error = await failureOf(extractWithChain("https://example.com/a", ["tavily"], baseContext({ http })));

		expect(error).toBeInstanceOf(ExtractError);
		expect(fetchJson).not.toHaveBeenCalled();
		expect(fetchText).not.toHaveBeenCalled();
		expect(error.attempts[0]).toMatchObject({ extractor: "tavily", status: "skipped" });
		expect(error.attempts[0]?.reason).toContain("TAVILY_API_KEY");
	});

	it("抛错的提取器顺延到下一个", async () => {
		const first = fake("tavily", { error: "HTTP 500" });
		const second = fake("exa", { content: "y".repeat(300) });

		const page = await extractWithChain("https://example.com/a", ["tavily", "exa"], baseContext(), table(first, second));

		expect(first.calls()).toBe(1);
		expect(page.extractor).toBe("exa");
	});

	it("自定义提取器 unavailableReason 抛错时记因并顺延", async () => {
		const broken: Extractor = {
			id: "tavily",
			unavailableReason: () => {
				throw new Error("探测 key 失败");
			},
			async extract(url) {
				return { url, content: "x".repeat(300) };
			},
		};
		const second = fake("exa", { content: "y".repeat(300) });

		const page = await extractWithChain("https://example.com/a", ["tavily", "exa"], baseContext(), table({ extractor: broken }, second));

		expect(page.extractor).toBe("exa");
	});

	it("内容短于 minChars 视为无效并顺延", async () => {
		const short = fake("tavily", { content: "太短" });
		const long = fake("exa", { content: "x".repeat(300) });

		const page = await extractWithChain("https://example.com/a", ["tavily", "exa"], baseContext(), table(short, long));

		expect(short.calls()).toBe(1);
		expect(page.extractor).toBe("exa");
	});

	it("成功率先后，后续提取器不被调用", async () => {
		const winner = fake("tavily", { content: "x".repeat(300) });
		const later1 = fake("exa", { content: "x".repeat(300) });
		const later2 = fake("html", { content: "x".repeat(300) });

		const page = await extractWithChain("https://example.com/a", ["tavily", "exa", "html"], baseContext(), table(winner, later1, later2));

		expect(page.extractor).toBe("tavily");
		expect(later1.calls()).toBe(0);
		expect(later2.calls()).toBe(0);
	});

	it("全部失败时汇总每个提取器的名字与原因", async () => {
		const tavily = fake("tavily", { error: "HTTP 401" });
		const exa = fake("exa", { skipped: "not configured (EXA_API_KEY env var or config.apiKeys.exa)" });
		const html = fake("html", { content: "太短" });

		const error = await failureOf(extractWithChain("https://example.com/a", ["tavily", "exa", "html"], baseContext(), table(tavily, exa, html)));

		expect(error.attempts).toHaveLength(3);
		expect(error.message).toContain("tavily");
		expect(error.message).toContain("HTTP 401");
		expect(error.message).toContain("exa");
		expect(error.message).toContain("EXA_API_KEY");
		expect(error.message).toContain("html");
		expect(error.message).toContain("content too short");
	});

	it("title 缺失时用最终 URL 顶替", async () => {
		const winner = fake("exa", { content: "x".repeat(300) });

		const page = await extractWithChain("https://example.com/a", ["exa"], baseContext(), table(winner));

		expect(page.title).toBe("https://example.com/a");
	});

	it("内容超 maxCharsPerPage 时截断并标记", async () => {
		const winner = fake("tavily", { content: "x".repeat(5_000) });

		const page = await extractWithChain("https://example.com/a", ["tavily"], baseContext({ maxCharsPerPage: 1_000 }), table(winner));

		expect(page.truncated).toBe(true);
		expect(page.content.startsWith("x".repeat(1_000))).toBe(true);
		expect(page.content).toContain("[... truncated:");
	});
});
