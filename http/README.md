# http/ — 出站 HTTP 唯一出口

代理、超时、UA、`AbortSignal`、错误归一化。**不认 provider 语义、不 import 宿主包**；全仓库只有这一个模块直接调用 `undici` 的 `fetch`。

## API

```ts
createHttpClient({ proxy, timeoutMs, userAgent }): HttpClient
client.fetchText(url, { method?, headers?, body?, signal? }) → { status, url, contentType, text }
client.fetchJson<T>(url, request?)                          → { status, url, contentType, data: T }
class HttpError extends Error  // { type: HttpErrorType; url; status?; body? }
type HttpErrorType = "timeout" | "abort" | "http_status" | "parse" | "network" | "redirect" | "too_many_redirects"
```

## 契约要点

- **代理**：`proxy` 为 `undefined` / 空串时直连；非空时非本机目标经同一个 `ProxyAgent`。`localhost` / `127.0.0.0/8` / `::1`（含 `::ffff:` 映射）永远绕过代理。不读 `HTTP_PROXY` 等环境变量（PLAN §2.4）。
- **SSRF 边界**：入口 URL 不做校验——调用方必须在抓取前调用 `ssrf/assertPublicUrl`。本模块对重定向每一跳目标调用它，命中抛 `SsrfError`（非 http(s)、私有 / 回环地址均拒绝）。
- **超时**：`AbortSignal.timeout(timeoutMs)` 覆盖含重定向的整条请求链；调用方 `signal` 中断优先判定为 `abort`。
- **重定向**：上限 5 跳；跨 origin 丢弃 `authorization`；303 与 301/302 下的非 GET 请求改为 GET，307/308 保持 method / body。
- **userAgent**：强制使用配置值，请求头里的同名值会被覆盖；调用方无法绕过。
- **错误**：非 2xx 抛 `http_status`（`status` + `body` 供上层拼装信息）；200 但 body 非 JSON 抛 `parse`；DNS / 连接失败抛 `network`。
