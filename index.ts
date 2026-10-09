/**
 * pi-web-search-lite — Pi 扩展入口。
 * 只做三件事：loadConfig、按 tools.* / activation / guidance.* 注册两个工具、deferred 时在会话开始激活发现入口。
 * 配置损坏或工具名非法时启动即抛错（fail fast，不静默退化成空扩展）。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config/index.ts";
import { createFetchTool } from "./tools/fetch.ts";
import { createSearchTool } from "./tools/search.ts";

/** 宿主的按需发现入口；deferred 模式下必须处于激活集。 */
const LOADER_TOOL = "tool_search";

export default function piWebSearchLite(pi: ExtensionAPI): void {
	const config = loadConfig();
	const deferred = config.activation === "deferred";
	const exposure = deferred ? "deferred" : "direct";

	const toolNames: string[] = [];
	if (config.tools.web_search.enabled) {
		toolNames.push(config.tools.web_search.name);
		pi.registerTool({ ...createSearchTool(config), exposure, defaultActive: !deferred });
	}
	if (config.tools.web_fetch.enabled) {
		toolNames.push(config.tools.web_fetch.name);
		pi.registerTool({ ...createFetchTool(config), exposure, defaultActive: !deferred });
	}

	if (deferred) {
		// 动作方法（getAllTools / setActiveTools）在扩展加载期会抛「runtime not initialized」，只能在会话开始后调用
		pi.on("session_start", () => activateDeferred(pi, toolNames));
	}
}

/** deferred 依赖宿主内置 tool_search；缺失时直接激活本扩展工具，行为等价 eager。 */
function activateDeferred(pi: ExtensionAPI, toolNames: readonly string[]): void {
	const active = pi.getActiveTools();
	if (pi.getAllTools().some((tool) => tool.name === LOADER_TOOL)) {
		if (!active.includes(LOADER_TOOL)) pi.setActiveTools([...active, LOADER_TOOL]);
		return;
	}
	console.warn(`[pi-web-search-lite] activation is "deferred" but the host does not provide ${LOADER_TOOL}; activated the tools directly at session start.`);
	const missing = toolNames.filter((name) => !active.includes(name));
	if (missing.length > 0) pi.setActiveTools([...active, ...missing]);
}
