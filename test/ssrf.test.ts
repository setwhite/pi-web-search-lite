import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertPublicUrl, isLoopbackHost, SsrfError, type SsrfErrorType } from "../ssrf/index.ts";
import { listenEphemeral } from "./stub.ts";

/** 断言 input 被拒绝且错误类型匹配。 */
function expectBlocked(input: string, type: SsrfErrorType): void {
	try {
		assertPublicUrl(input);
	} catch (error) {
		expect(error).toBeInstanceOf(SsrfError);
		expect((error as SsrfError).type).toBe(type);
		expect((error as SsrfError).url).toBe(input);
		return;
	}
	throw new Error(`预期被拒绝但放行了：${input}`);
}

describe("assertPublicUrl：放行", () => {
	it.each([
		"https://example.com/a?b=c#d",
		"http://example.com:8080/path",
		"https://8.8.8.8/",
		"http://172.32.0.1/", // 172.32 不在 172.16–31 私有段
		"https://[2001:4860:4860::8888]/",
		"http://example.com./", // 末尾点（FQDN）不影响判定
		"http://100.63.0.1/", // 紧邻 100.64.0.0/10 之外
		"http://100.128.0.1/",
		"http://192.0.1.1/",
		"http://198.17.0.1/",
		"http://223.255.255.255/",
		"http://[64:ff9b::808:808]/", // NAT64 内嵌公网 8.8.8.8
	])("接受 %s", (input) => {
		expect(assertPublicUrl(input).href).toBe(new URL(input).href);
	});
});

describe("assertPublicUrl：拒绝", () => {
	it.each([
		"file:///etc/passwd",
		"ftp://example.com/x",
		"data:text/plain,hi",
		"javascript:alert(1)",
	])("拒绝非 http(s) 协议：%s", (input) => {
		expectBlocked(input, "blocked_protocol");
	});

	it.each(["not a url", "http://", "https://:443/"])("拒绝无法解析的 URL：%s", (input) => {
		expectBlocked(input, "invalid_url");
	});

	it.each([
		"http://localhost/",
		"http://LocalHost:8080/",
		"http://foo.local/",
		"http://foo.local./",
		"http://localhost./",
	])("拒绝本机 / .local 主机名：%s", (input) => {
		expectBlocked(input, "blocked_host");
	});

	it.each([
		"http://127.0.0.1/",
		"http://127.9.9.9/",
		"http://127.1/", // WHATWG URL 归一化为 127.0.0.1
		"http://10.1.2.3/",
		"http://172.16.0.1/",
		"http://172.31.255.254/",
		"http://192.168.1.1/",
		"http://169.254.169.254/",
		"http://0.0.0.0/",
		"http://100.64.0.1/",
		"http://100.100.100.200/",
		"http://192.0.0.1/",
		"http://198.18.0.1/",
		"http://224.0.0.1/",
		"http://240.0.0.1/",
		"http://255.255.255.255/",
	])("拒绝私有 / 回环 / link-local 字面量 IPv4：%s", (input) => {
		expectBlocked(input, "blocked_ip");
	});

	it.each([
		"http://[::1]/",
		"http://[fe80::1]/",
		"http://[fd00::1]/",
		"http://[fc00::1]/",
		"http://[::ffff:127.0.0.1]/",
		"http://[::ffff:7f00:1]/",
		"http://[::]/",
		"http://[fec0::1]/",
		"http://[ff02::1]/",
		"http://[64:ff9b::a00:1]/",
		"http://[64:ff9b::7f00:1]/",
		"http://[2002:a00:1::1]/",
	])("拒绝私有 / 回环 / link-local 字面量 IPv6：%s", (input) => {
		expectBlocked(input, "blocked_ip");
	});
});

describe("assertPublicUrl：零网络请求", () => {
	let server: ReturnType<typeof createServer>;
	let base: string;
	let hits = 0;

	beforeAll(async () => {
		server = createServer((_req, res) => {
			hits += 1;
			res.end("ok");
		});
		const port = await listenEphemeral(server);
		base = `http://127.0.0.1:${port}/`;
	});

	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	it("拒绝本机回环地址时桩 server 命中数为 0", () => {
		expectBlocked(base, "blocked_ip");
		expect(hits).toBe(0);
	});
});

describe("isLoopbackHost", () => {
	it.each(["localhost", "LocalHost", "127.0.0.1", "127.1.2.3", "::1", "[::1]", "::ffff:127.0.0.1"])(
		"%s 判定为回环",
		(host) => {
			expect(isLoopbackHost(host)).toBe(true);
		},
	);

	it.each(["example.com", "10.0.1.1", "192.168.1.1", "::ffff:10.0.0.1", "2001:4860:4860::8888"])(
		"%s 判定为非回环",
		(host) => {
			expect(isLoopbackHost(host)).toBe(false);
		},
	);
});
