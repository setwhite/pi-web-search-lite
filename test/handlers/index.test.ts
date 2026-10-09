import { describe, expect, it } from "vitest";
import { runPageHandlers } from "../../handlers/index.ts";
import { baseContext } from "./fixtures.ts";

describe("runPageHandlers", () => {
	it("非 github URL 不匹配，无 skips", async () => {
		const outcome = await runPageHandlers(new URL("https://example.com/page"), baseContext());

		expect(outcome).toEqual({ result: null, skips: [] });
	});

	it("github URL 但 handler 禁用时回落到链并带原因", async () => {
		const ctx = baseContext({
			github: { enabled: false, command: "gh", timeoutMs: 10_000, maxChars: 150_000 },
		});

		const outcome = await runPageHandlers(new URL("https://github.com/o/r"), ctx);

		expect(outcome.result).toBeNull();
		expect(outcome.skips).toHaveLength(1);
		expect(outcome.skips[0]?.handler).toBe("github");
		expect(outcome.skips[0]?.reason).toContain("enabled");
	});
});
