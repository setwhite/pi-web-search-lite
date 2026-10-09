/**
 * 静态 SSRF 守卫：发请求前做字面量判定（协议、主机名、字面量 IP）。
 * 不解析 DNS、不发任何请求；`http/` 也复用这里的回环判定做代理绕过。
 */

export type SsrfErrorType = "invalid_url" | "blocked_protocol" | "blocked_host" | "blocked_ip";

/** 结构化 SSRF 错误；模型可见文案由 tools/ 组装。 */
export class SsrfError extends Error {
	readonly type: SsrfErrorType;
	readonly url: string;

	constructor(type: SsrfErrorType, url: string, reason: string) {
		super(`${reason}: ${url}`);
		this.name = "SsrfError";
		this.type = type;
		this.url = url;
	}
}

/**
 * 校验 URL 可安全抓取，返回解析结果；不合法时抛 `SsrfError`。
 * 仅放行 http/https，拒绝本机名、`.local` 与私有 / 回环 / link-local 字面量 IP。
 */
export function assertPublicUrl(input: string): URL {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new SsrfError("invalid_url", input, "not a valid URL");
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new SsrfError("blocked_protocol", input, `only http/https is allowed, got ${url.protocol}`);
	}

	const host = normalizeHostname(url.hostname);
	if (host === "") throw new SsrfError("invalid_url", input, "missing host name");
	if (isLocalName(host)) throw new SsrfError("blocked_host", input, `blocked host (localhost or .local): ${host}`);
	if (isBlockedIp(host)) throw new SsrfError("blocked_ip", input, `blocked private, loopback or link-local address: ${host}`);

	return url;
}

/** 回环主机名或字面量：代理对这类目标强制直连（PLAN §2.4）。 */
export function isLoopbackHost(hostname: string): boolean {
	const host = normalizeHostname(hostname);
	if (host === "localhost" || host.endsWith(".localhost")) return true;

	const v4 = parseIpv4(host);
	if (v4) return v4[0] === 127;

	const v6 = parseIpv6(host);
	if (!v6) return false;
	if (isAllZero(v6.slice(0, 15)) && v6[15] === 1) return true;
	if (isMappedIpv4(v6)) return v6[12] === 127;
	return false;
}

// --- 主机名与 IP 判定 -------------------------------------------------------

function normalizeHostname(hostname: string): string {
	return hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
}

function isLocalName(host: string): boolean {
	return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local");
}

function isBlockedIp(host: string): boolean {
	const v4 = parseIpv4(host);
	if (v4) return isBlockedIpv4(v4);

	const v6 = parseIpv6(host);
	if (!v6) return false;
	if (isAllZero(v6)) return true; // ::
	if (isAllZero(v6.slice(0, 15)) && v6[15] === 1) return true; // ::1
	if (isMappedIpv4(v6)) return isBlockedIpv4(v6.slice(12)); // ::ffff:a.b.c.d
	if ((v6[0] & 0xfe) === 0xfc) return true; // fc00::/7 唯一本地地址
	if (v6[0] === 0xfe && (v6[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
	return false;
}

function isBlockedIpv4(bytes: number[]): boolean {
	const [a, b] = bytes;
	return (
		a === 0 || // 0.0.0.0/8 未指定
		a === 127 || // 127.0.0.0/8 回环
		a === 10 || // 10.0.0.0/8
		(a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
		(a === 192 && b === 168) || // 192.168.0.0/16
		(a === 169 && b === 254) // 169.254.0.0/16 link-local（含 169.254.169.254）
	);
}

function parseIpv4(host: string): number[] | undefined {
	const parts = host.split(".");
	if (parts.length !== 4) return undefined;
	const bytes: number[] = [];
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return undefined;
		const value = Number(part);
		if (value > 255) return undefined;
		bytes.push(value);
	}
	return bytes;
}

/** 展开成 16 字节；非法 IPv6 返回 undefined。 */
function parseIpv6(host: string): number[] | undefined {
	if (!host.includes(":")) return undefined;
	const [head, tail] = host.split("::");
	const headParts = tail === undefined ? expandTrailing(head === "" ? [] : head.split(":")) : head === "" ? [] : head.split(":");
	const tailParts = tail === undefined || tail === "" ? [] : expandTrailing(tail.split(":"));
	const missing = 8 - headParts.length - tailParts.length;
	if (tail === undefined ? missing !== 0 : missing < 1) return undefined;

	const parts = [...headParts, ...new Array<string>(missing).fill("0"), ...tailParts];
	const bytes: number[] = [];
	for (const part of parts) {
		if (!/^[0-9a-f]{1,4}$/.test(part)) return undefined;
		const value = Number.parseInt(part, 16);
		bytes.push(value >> 8, value & 0xff);
	}
	return bytes;
}

/** 末组写成 IPv4（如 ::ffff:127.0.0.1）时展开为两个 hextet。 */
function expandTrailing(parts: string[]): string[] {
	const last = parts[parts.length - 1];
	if (last === undefined || !last.includes(".")) return parts;
	const v4 = parseIpv4(last);
	if (!v4) return parts; // 交给后续正则报非法
	return [...parts.slice(0, -1), ((v4[0] << 8) | v4[1]).toString(16), ((v4[2] << 8) | v4[3]).toString(16)];
}

function isMappedIpv4(v6: number[]): boolean {
	return v6[10] === 0xff && v6[11] === 0xff && isAllZero(v6.slice(0, 10));
}

function isAllZero(bytes: number[]): boolean {
	return bytes.every((byte) => byte === 0);
}
