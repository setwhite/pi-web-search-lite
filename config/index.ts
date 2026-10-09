/**
 * 配置模块：读取 `<agent dir>/pi-web-search-lite/config.json`，校验并 clamp。
 * - 文件缺失 = 全默认值；JSON 损坏或字段非法 = 抛 Error（消息含文件路径与字段路径）。
 * - API key 合并：PROVIDER_ENV_KEYS 环境变量优先于文件里的 apiKeys。
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONFIG_FILE_NAME, CONFIG_SUBPATH, ENV_AGENT_DIR, type Raw, type ResolvedConfig } from "./schema.ts";
import { buildConfig } from "./validate.ts";

export * from "./schema.ts";

export interface LoadConfigOptions {
	/** 配置文件绝对路径；缺省由 env 推导。 */
	configPath?: string;
	/** 环境变量来源；测试可注入。 */
	env?: NodeJS.ProcessEnv;
}

/** 读取并校验配置；文件不存在时返回全默认值。校验失败抛 Error。 */
export function loadConfig(options: LoadConfigOptions = {}): ResolvedConfig {
	const env = options.env ?? process.env;
	const configPath = options.configPath ?? defaultConfigPath(env);
	const errors: string[] = [];
	const config = buildConfig(readRawConfig(configPath), env, errors);
	if (errors.length > 0) {
		const lines = errors.map((item) => `- ${item}`).join("\n");
		throw new Error(`配置文件 ${configPath} 有 ${errors.length} 处非法字段：\n${lines}`);
	}
	return config;
}

/** 默认路径：PI_CODING_AGENT_DIR > ~/.pi/agent，子路径 pi-web-search-lite/config.json。 */
export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
	const agentDir = env[ENV_AGENT_DIR] || join(homedir(), ".pi", "agent");
	return join(agentDir, CONFIG_SUBPATH, CONFIG_FILE_NAME);
}

function readRawConfig(configPath: string): Raw {
	let text: string;
	try {
		text = readFileSync(configPath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw new Error(`无法读取配置文件 ${configPath}：${errorText(error)}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new Error(`配置文件 ${configPath} 不是合法 JSON：${errorText(error)}`);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`配置文件 ${configPath} 的顶层必须是 JSON 对象`);
	}
	return parsed as Raw;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
