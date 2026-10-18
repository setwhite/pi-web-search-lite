import { describe, expect, it } from "vitest";
import { runPageHandlers } from "../../handlers/index.ts";
import type { HandlerContext } from "../../handlers/types.ts";
import { baseContext } from "./fixtures.ts";

const BASE = "https://redlib.catsarch.com";
const POST =
	"https://www.reddit.com/r/PiCodingAgent/comments/1ue3hsb/pi_herdr_and_gondolin_combo_has_been_a_great/";

function context(overrides: Partial<NonNullable<HandlerContext["reddit"]>> = {}): HandlerContext {
	return baseContext({ reddit: { enabled: true, baseUrl: BASE, ...overrides } });
}

describe("reddit handler：只换域名", () => {
	it("帖子页 path 与 query 照抄，并带上原 URL", async () => {
		const outcome = await runPageHandlers(new URL(`${POST}?sort=top&t=week`), context());

		expect(outcome.result).toBeNull();
		expect(outcome.skips).toEqual([]);
		expect(outcome.rewrite).toEqual({
			kind: "rewrite",
			handler: "reddit",
			from: `${POST}?sort=top&t=week`,
			url: `${BASE}/r/PiCodingAgent/comments/1ue3hsb/pi_herdr_and_gondolin_combo_has_been_a_great/?sort=top&t=week`,
		});
	});

	it.each([
		"https://reddit.com/r/rust/",
		"https://old.reddit.com/r/rust/top/?t=month",
		"https://new.reddit.com/r/rust/",
		"https://np.reddit.com/r/rust/",
		"https://m.reddit.com/r/rust/",
		"https://i.reddit.com/r/rust/",
		"https://redd.it/1ue3hsb",
	])("命中 %s", async (input) => {
		const outcome = await runPageHandlers(new URL(input), context());

		expect(outcome.rewrite?.url).toBe(input.replace(/^https:\/\/(?:[^/]+)/, BASE));
	});

	it("baseUrl 带子路径时前缀保留", async () => {
		const outcome = await runPageHandlers(
			new URL(POST),
			context({ baseUrl: "https://example.com/redlib/" }),
		);

		expect(outcome.rewrite?.url).toBe(
			`https://example.com/redlib/r/PiCodingAgent/comments/1ue3hsb/pi_herdr_and_gondolin_combo_has_been_a_great/`,
		);
	});

	it("丢掉锚点", async () => {
		const outcome = await runPageHandlers(new URL(`${POST}#comment-abc`), context());

		expect(outcome.rewrite?.url).not.toContain("#");
	});

	it.each([
		"https://i.redd.it/abc123.jpg",
		"https://v.redd.it/abc123",
		"https://preview.redd.it/abc123.png",
		"https://www.reddit.com.evil.com/r/rust/",
		"https://notreddit.com/r/rust/",
		"https://example.com/r/rust/",
	])("不碰 %s", async (input) => {
		const outcome = await runPageHandlers(new URL(input), context());

		expect(outcome).toEqual({ result: null, skips: [] });
	});

	it("enabled 为 false 时只留一条 skip 说明", async () => {
		const outcome = await runPageHandlers(new URL(POST), context({ enabled: false }));

		expect(outcome.result).toBeNull();
		expect(outcome.rewrite).toBeUndefined();
		expect(outcome.skips).toHaveLength(1);
		expect(outcome.skips[0]?.handler).toBe("reddit");
		expect(outcome.skips[0]?.reason).toContain("handlers.reddit.enabled");
	});
});
