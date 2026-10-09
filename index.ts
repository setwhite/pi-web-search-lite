/**
 * pi-web-search-lite — Pi 扩展入口。
 * 当前只加载并校验配置（配置损坏时启动即报错）；两个工具的注册在 T7 完成。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config/index.ts";

export default function piWebSearchLite(_pi: ExtensionAPI): void {
	loadConfig();
}
