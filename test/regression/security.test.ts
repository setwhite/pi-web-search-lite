/**
 * T8 回归：SSRF 黑名单在工具入口逐条生效，且被拒时一个请求都不发。
 * 代理规则（非本机走桩代理、本机绕过）由 test/http.test.ts 覆盖；本文件验证工具层不越过守卫。
 */

import { describe, expect, it } from "vitest";
import { SsrfError } from "../../ssrf/index.ts";
import { executeFetch } from "../../tools/fetch.ts";
import { fakeHttp, makeConfig, rejectionOf } from "../tools/fixtures.ts";

/** 故意指向不可用的本地端口：一旦守卫失效，测试会以网络错误而非 SsrfError 失败。 */
const config = makeConfig({ proxy: "http://127.0.0.1:9", fetch: { minChars: 0 } });

const BLOCKED = [
	"http://127.0.0.1/admin",
	"http://127.1.2.3/",
	"http://localhost:8080/",
	"http://[::1]/",
	"http://[::ffff:127.0.0.1]/",
	"http://10.0.0.5/",
	"http://172.16.3.4/",
	"http://192.168.1.10/",
	"http://169.254.169.254/latest/meta-data/",
	"http://metadata.local/",
	"file:///etc/passwd",
	"ftp://example.com/x",
];

describe("回归：web_fetch 入口的 SSRF 黑名单", () => {
	it.each(BLOCKED)("拒绝 %s 且不发请求", async (url) => {
		const http = fakeHttp(() => {
			throw new Error("守卫失效：不应发请求");
		});

		const error = await rejectionOf(executeFetch(config, { url }, undefined, { http }));

		expect(error).toBeInstanceOf(SsrfError);
		expect(http.calls).toEqual([]);
	});

	it("公网域名放行（证明未过度拦截）", async () => {
		const http = fakeHttp(() => ({ text: `<html><title>ok</title><body>${"内容".repeat(150)}</body></html>` }));

		const result = await executeFetch(config, { url: "http://example.test/ok" }, undefined, { http });

		expect(http.calls[0]?.url).toBe("http://example.test/ok");
		expect(result.details.source).toBe("html");
	});
});
