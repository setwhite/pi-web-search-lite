import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_MAX_BYTES } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { finalizeContent } from "../../tools/result.ts";

const spilled: string[] = [];
afterEach(() => {
	for (const path of spilled.splice(0)) rmSync(dirname(path), { recursive: true, force: true });
});

describe("finalizeContent", () => {
	it("未超限时原样返回且不落盘", async () => {
		const outcome = await finalizeContent("短文本", { maxInlineChars: null, maxInlineLines: null, spillToFile: true });

		expect(outcome).toEqual({ content: "短文本", truncated: false, fullOutputPath: undefined });
	});

	it("按 maxInlineLines 截断并写临时文件，content 给出绝对路径", async () => {
		const text = Array.from({ length: 500 }, (_, index) => `第 ${index} 行`).join("\n");

		const outcome = await finalizeContent(text, { maxInlineChars: null, maxInlineLines: 10, spillToFile: true });
		const path = outcome.fullOutputPath;
		if (path) spilled.push(path);

		expect(outcome.truncated).toBe(true);
		expect(path).toBeTruthy();
		expect(outcome.content).toContain("[... output truncated:");
		expect(outcome.content).toContain(path);
		expect(existsSync(path ?? "")).toBe(true);
		expect(readFileSync(path ?? "", "utf-8")).toBe(text);
	});

	it("spillToFile 为 false 时不写文件，仍说明已截断", async () => {
		const outcome = await finalizeContent("x".repeat(10_000), { maxInlineChars: 1_000, maxInlineLines: null, spillToFile: false });

		expect(outcome.truncated).toBe(true);
		expect(outcome.fullOutputPath).toBeUndefined();
		expect(outcome.content).toContain("[... output truncated:");
		expect(outcome.content).toContain("spillToFile");
	});

	it("配置上限超过宿主上限时按宿主上限截断", async () => {
		const outcome = await finalizeContent("x".repeat(DEFAULT_MAX_BYTES + 1_000), {
			maxInlineChars: 100_000_000,
			maxInlineLines: 1_000_000,
			spillToFile: false,
		});

		expect(outcome.truncated).toBe(true);
		expect(outcome.content.length).toBeLessThan(DEFAULT_MAX_BYTES);
	});
});
