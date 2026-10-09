/**
 * pi-web-search-lite — Pi 扩展入口。
 * 只做三件事：loadConfig、按 tools.* / activation / guidance.* 注册两个工具、deferred 时激活内置 tool_search。
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
	const plan = resolveActivation(pi, config.activation);
	if (config.tools.web_search.enabled) {
		pi.registerTool({ ...createSearchTool(config), exposure: plan.exposure, defaultActive: plan.defaultActive });
	}
	if (config.tools.web_fetch.enabled) {
		pi.registerTool({ ...createFetchTool(config), exposure: plan.exposure, defaultActive: plan.defaultActive });
	}
	if (plan.deferred) {
		const active = pi.getActiveTools();
		if (!active.includes(LOADER_TOOL)) pi.setActiveTools([...active, LOADER_TOOL]);
	}
}

interface ActivationPlan {
	exposure: "direct" | "deferred";
	defaultActive: boolean;
	deferred: boolean;
}

/** deferred 依赖宿主内置 tool_search；缺失时退回 eager 并打印一行警告。 */
function resolveActivation(pi: ExtensionAPI, mode: "eager" | "deferred"): ActivationPlan {
	if (mode === "deferred") {
		if (pi.getAllTools().some((tool) => tool.name === LOADER_TOOL)) {
			return { exposure: "deferred", defaultActive: false, deferred: true };
		}
		console.warn(`[pi-web-search-lite] activation 为 "deferred" 但宿主未提供 ${LOADER_TOOL}，已退回 eager。`);
	}
	return { exposure: "direct", defaultActive: true, deferred: false };
}
