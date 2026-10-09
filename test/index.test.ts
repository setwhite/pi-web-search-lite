import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import piWebSearchLite from "../index.ts";

const dirs: string[] = [];

/** 每个用例独立的 agent 目录；config 为 undefined 时不写文件（全默认值）。 */
function useConfig(config?: unknown): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-web-search-lite-index-"));
	dirs.push(dir);
	if (config !== undefined) {
		mkdirSync(join(dir, "pi-web-search-lite"), { recursive: true });
		writeFileSync(join(dir, "pi-web-search-lite", "config.json"), JSON.stringify(config), "utf-8");
	}
	vi.stubEnv("PI_CODING_AGENT_DIR", dir);
	// 隔离真实环境变量，保证用例只受配置文件影响
	vi.stubEnv("TAVILY_API_KEY", "");
	vi.stubEnv("BRAVE_API_KEY", "");
	vi.stubEnv("EXA_API_KEY", "");
	vi.stubEnv("WEB_SEARCH_PROVIDER", "");
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface FakeApiResult {
	api: ExtensionAPI;
	registered: ToolDefinition[];
	setActiveCalls: string[][];
}

function fakeApi(tools: string[] = [], active: string[] = []): FakeApiResult {
	const registered: ToolDefinition[] = [];
	const setActiveCalls: string[][] = [];
	const current = [...active];
	const api = {
		registerTool: (tool: ToolDefinition) => void registered.push(tool),
		getAllTools: () => tools.map((name) => ({ name })),
		getActiveTools: () => [...current],
		setActiveTools: (names: string[]) => {
			setActiveCalls.push([...names]);
			current.splice(0, current.length, ...names);
		},
	} as unknown as ExtensionAPI;
	return { api, registered, setActiveCalls };
}

describe("index：注册与开关", () => {
	it("默认配置注册两个 direct 工具", () => {
		useConfig();
		const { api, registered, setActiveCalls } = fakeApi(["tool_search"]);

		piWebSearchLite(api);

		expect(registered.map((tool) => tool.name)).toEqual(["web_search", "web_fetch"]);
		expect(registered.every((tool) => tool.exposure === "direct" && tool.defaultActive === true)).toBe(true);
		expect(setActiveCalls).toEqual([]);
	});

	it("tools.*.enabled 为 false 时不注册对应工具", () => {
		useConfig({ tools: { web_search: { enabled: false } } });
		const { api, registered } = fakeApi(["tool_search"]);

		piWebSearchLite(api);

		expect(registered.map((tool) => tool.name)).toEqual(["web_fetch"]);
	});

	it("tools.*.name 生效", () => {
		useConfig({ tools: { web_search: { name: "find_web" }, web_fetch: { name: "grab_page" } } });
		const { api, registered } = fakeApi();

		piWebSearchLite(api);

		expect(registered.map((tool) => tool.name)).toEqual(["find_web", "grab_page"]);
	});

	it("占用宿主保留名时抛错", () => {
		useConfig({ tools: { web_search: { name: "read" } } });

		expect(() => piWebSearchLite(fakeApi().api)).toThrow(/保留/);
	});

	it("两个工具重名时抛错", () => {
		useConfig({ tools: { web_search: { name: "same" }, web_fetch: { name: "same" } } });

		expect(() => piWebSearchLite(fakeApi().api)).toThrow(/不能相同/);
	});
});

describe("index：deferred 激活", () => {
	it("deferred 注册为 deferred + defaultActive false，并把 tool_search 合入激活集", () => {
		useConfig({ activation: "deferred" });
		const { api, registered, setActiveCalls } = fakeApi(["tool_search", "read"], ["read"]);

		piWebSearchLite(api);

		expect(registered.every((tool) => tool.exposure === "deferred" && tool.defaultActive === false)).toBe(true);
		expect(setActiveCalls).toEqual([["read", "tool_search"]]);
	});

	it("tool_search 已在激活集时不重复调用 setActiveTools", () => {
		useConfig({ activation: "deferred" });
		const { api, setActiveCalls } = fakeApi(["tool_search"], ["tool_search"]);

		piWebSearchLite(api);

		expect(setActiveCalls).toEqual([]);
	});

	it("宿主不提供 tool_search 时退回 eager 并打印一行警告", () => {
		useConfig({ activation: "deferred" });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { api, registered, setActiveCalls } = fakeApi(["read"], ["read"]);

		piWebSearchLite(api);

		expect(registered.every((tool) => tool.exposure === "direct")).toBe(true);
		expect(setActiveCalls).toEqual([]);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain("tool_search");
	});
});

describe("index：guidance 覆盖", () => {
	it("guidance.* 覆盖 description / promptSnippet / promptGuidelines，未配置的用默认值", () => {
		useConfig({
			guidance: {
				web_search: { description: "自定义搜索描述", promptSnippet: "自定义一行", promptGuidelines: ["优先用 web_search"] },
			},
		});
		const { api, registered } = fakeApi();

		piWebSearchLite(api);

		const search = registered.find((tool) => tool.name === "web_search");
		const fetch = registered.find((tool) => tool.name === "web_fetch");
		expect(search?.description).toBe("自定义搜索描述");
		expect(search?.promptSnippet).toBe("自定义一行");
		expect(search?.promptGuidelines).toEqual(["优先用 web_search"]);
		expect(fetch?.description).not.toBe("自定义搜索描述");
		expect(fetch?.promptSnippet).toBeTruthy();
		expect(fetch?.promptGuidelines).toBeUndefined();
	});
});
