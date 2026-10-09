# ssrf/ — 静态 SSRF 守卫

发请求前的字面量 URL 判定：协议、主机名、字面量 IP。**不解析 DNS、不发任何请求、不 import 宿主包**；重定向逐跳校验由 `http/` 调用本模块完成。

## API

```ts
assertPublicUrl(input: string): URL        // 通过返回解析结果，否则抛 SsrfError
isLoopbackHost(hostname: string): boolean  // localhost / 127.0.0.0/8 / ::1（含 ::ffff: 映射）
class SsrfError extends Error              // { type: SsrfErrorType; url: string }
type SsrfErrorType = "invalid_url" | "blocked_protocol" | "blocked_host" | "blocked_ip"
```

## 判定规则

仅放行 `http:` / `https:`，拒绝：

| 类别 | 例子 |
|---|---|
| 协议 | `file:`、`ftp:`、`data:`、`javascript:` |
| 本机 / 本地域名 | `localhost`、`*.localhost`、`*.local`（大小写、末尾点不敏感） |
| 回环 IPv4 | `127.0.0.0/8`（URL 解析器会先把 `127.1` 归一化） |
| 私有 IPv4 | `10/8`、`172.16/12`、`192.168/16` |
| link-local / 未指定 | `169.254/16`（含 `169.254.169.254`）、`0.0.0.0/8` |
| IPv6 | `::`、`::1`、`fc00::/7`、`fe80::/10`、`::ffff:a.b.c.d`（按 IPv4 判定） |

端口不做白名单（`URL` 的解析合法性即校验）。`isLoopbackHost` 只判回环（供 `http/` 决定绕过代理），与 `assertPublicUrl` 的封禁范围不同。

## 明确不做

DNS 解析、DNS rebinding 检测（PLAN §3 非目标）；主机名里 DNS 指向私网的场景本模块放行。
