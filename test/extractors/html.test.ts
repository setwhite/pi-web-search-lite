import { describe, expect, it } from "vitest";
import { extractTitle, htmlExtractor, htmlToText } from "../../extractors/html.ts";
import type { ExtractorContext } from "../../extractors/types.ts";
import { createHttpClient } from "../../http/index.ts";
import { startTrackedStubServer } from "../stub.ts";

const FIXTURE = `<!doctype html>
<html>
<head>
<title>  示例 &amp; 标题  </title>
<style>.hidden { color: red; }</style>
<script type="text/javascript">console.log("noise");</script>
</head>
<body>
<h1>标题一</h1>
<p>第一段&nbsp;文本 &lt;tag&gt; &#x4E2D;&#25991;</p>
<noscript>请开启 JS</noscript>
<div>第二段<br>换行</div>
</body>
</html>`;

function makeContext(): ExtractorContext {
	return {
		http: createHttpClient({ proxy: undefined, timeoutMs: 5_000, userAgent: "pi-web-search-lite/test" }),
		apiKeys: {},
		minChars: 0,
		maxCharsPerPage: 150_000,
	};
}

describe("extractTitle", () => {
	it("抽取 title 并解实体、压空白", () => {
		expect(extractTitle(FIXTURE)).toBe("示例 & 标题");
	});

	it("没有 title 时返回 undefined", () => {
		expect(extractTitle("<html><body>hi</body></html>")).toBeUndefined();
	});
});

describe("htmlToText", () => {
	it("剥离 script/style/noscript，块级标签转换行，解实体，压空白", () => {
		const text = htmlToText(FIXTURE);

		expect(text).toContain("标题一");
		expect(text).toContain("第一段 文本 <tag> 中文");
		expect(text).toContain("第二段\n换行");
		expect(text).not.toContain("console.log");
		expect(text).not.toContain("color: red");
		expect(text).not.toContain("请开启 JS");
		expect(text).not.toContain("<h1>");
		expect(text).not.toContain("</p>");
		expect(text).not.toContain("<div>");
		expect(text).not.toMatch(/\n{3,}/);
		expect(text).not.toMatch(/ {2,}/);
	});

	it("大小写混写的标签同样处理", () => {
		const text = htmlToText("<P>A</P><SCRIPT>bad()</SCRIPT><DIV>B</DIV>");

		expect(text).toBe("A\nB");
	});

	it("定义列表等块级标签也产生换行", () => {
		expect(htmlToText("<dl><dt>术语</dt><dd>解释</dd></dl>")).toBe("术语\n解释");
	});

	it("非法码点（NUL / 孤立代理）被丢弃", () => {
		expect(htmlToText("A&#0;B&#xD800;C")).toBe("ABC");
	});
});

describe("htmlExtractor", () => {
	it("通过 http 抓取并返回正文与标题", async () => {
		const stub = await startTrackedStubServer(() => ({ contentType: "text/html; charset=utf-8", body: FIXTURE }));

		const page = await htmlExtractor.extract(`${stub.base}/page`, makeContext());

		expect(page.url).toBe(`${stub.base}/page`);
		expect(page.title).toBe("示例 & 标题");
		expect(page.content).toContain("第一段 文本 <tag> 中文");
	});

	it("二进制内容类型直接抛错", async () => {
		const stub = await startTrackedStubServer(() => ({ contentType: "application/pdf", body: "%PDF-1.4" }));

		await expect(htmlExtractor.extract(`${stub.base}/file.pdf`, makeContext())).rejects.toThrow(/不支持的内容类型/);
	});
});
