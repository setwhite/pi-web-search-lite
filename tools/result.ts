/**
 * 工具结果信封：宿主截断 + 超限 spill 到临时文件。
 * 唯一允许 import 宿主包（工具类型与截断工具）的工具层文件；其余模块不依赖宿主 API。
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	truncateHead,
	withFileMutationQueue,
	type AgentToolResult,
} from "@earendil-works/pi-coding-agent";

export type { AgentToolResult, Theme, ToolDefinition, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";

export interface FinalizeOptions {
	/** `config.context.maxInlineChars`；null = 宿主 DEFAULT_MAX_BYTES。超过宿主上限时按宿主上限截断。 */
	maxInlineChars: number | null;
	maxInlineLines: number | null;
	spillToFile: boolean;
	/** 临时文件名；缺省 output.md。 */
	fileName?: string;
}

export interface FinalizeOutcome {
	content: string;
	truncated: boolean;
	fullOutputPath?: string;
}

/** 截断并按配置 spill：返回模型可见 content（含续读提示）与结构化标记。 */
export async function finalizeContent(text: string, options: FinalizeOptions): Promise<FinalizeOutcome> {
	const result = truncateHead(text, {
		maxBytes: clampToHost(options.maxInlineChars, DEFAULT_MAX_BYTES),
		maxLines: clampToHost(options.maxInlineLines, DEFAULT_MAX_LINES),
	});
	if (!result.truncated) return { content: text, truncated: false, fullOutputPath: undefined };

	let fullOutputPath: string | undefined;
	if (options.spillToFile) {
		const dir = await mkdtemp(join(tmpdir(), "pi-web-search-lite-"));
		const target = join(dir, options.fileName ?? "output.md");
		await withFileMutationQueue(target, () => writeFile(target, text, "utf-8"));
		fullOutputPath = target;
	}

	const notes = [
		`[... output truncated: ${result.totalLines} lines / ${result.totalBytes} bytes total, kept ${result.outputLines} lines here.]`,
		fullOutputPath
			? `Full output written to ${fullOutputPath}; read that file to continue.`
			: "Not written to a temp file (context.spillToFile is false).",
	];
	return { content: `${result.content}\n\n${notes.join("\n")}`, truncated: true, fullOutputPath };
}

/** 组装宿主工具结果：文本进模型上下文，结构化数据只进 details。 */
export function buildToolResult<T>(text: string, details: T): AgentToolResult<T> {
	return { content: [{ type: "text", text }], details };
}

/** 只压上界：下界（1_000 / 50）由 config 层 clamp 保证；直接传 0 会落到宿主「首行超限」分支。 */
function clampToHost(value: number | null, hostLimit: number): number {
	return value === null ? hostLimit : Math.min(value, hostLimit);
}
