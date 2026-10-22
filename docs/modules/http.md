# http/ — 扩展自身出站 HTTP 的唯一出口

代理、超时、UA、`AbortSignal`、错误归一化。**不认 provider 语义、不 import 宿主包**；全仓库只有这一个模块直接调用 `undici` 的 `fetch`，gh 子进程不走本模块（见 `handlers.md`）。

## API

```ts
createHttpClient({ proxy, timeoutMs, userAgent }): HttpClient
client.fetchText(url, { method?, headers?, body?, signal? }) → { status, url, contentType, text }
client.fetchJson<T>(url, request?)                          → { status, url, contentType, data: T }
class HttpError extends Error  // { type: HttpErrorType; url; status?; body? }
type HttpErrorType = "timeout" | "abort" | "http_status" | "parse" | "network" | "redirect" | "too_many_redirects"
```

## 契约要点

- **代理**：`proxy` 为 `undefined` / 空串时直连；非空时非本机目标经同一个 `ProxyAgent`。`localhost` / `*.localhost` / `127.0.0.0/8` / `::1`（含 `::ffff:` 映射）永远绕过代理。不读 `HTTP_PROXY` 等环境变量（ADR-0004；gh 子进程的代理注入见 `handlers.md`）。
- **SSRF 边界**：入口 URL 不做校验——调用方必须在抓取前调用 `ssrf/assertPublicUrl`。本模块对重定向每一跳目标调用它，命中抛 `SsrfError`（非 http(s)、私有 / 回环地址均拒绝）。
- **超时**：`AbortSignal.timeout(timeoutMs)` 覆盖含重定向的整条请求链；调用方 `signal` 中断优先判定为 `abort`。
- **重定向**：上限 5 跳；跨 origin 摘掉认证头——`authorization`，以及任何以 `token` / `api-key` / `api_key` / `apikey` 结尾的头名（覆盖 provider 的 `x-api-key`、`x-subscription-token`），其余请求头保留；303 一律改为 GET，301/302 下的非 GET/HEAD 请求改为 GET，307/308 保持 method / body；非法 Location 抛 `redirect`。
- **userAgent**：强制使用配置值，请求头里的同名值会被覆盖；调用方无法绕过。
- **错误**：非 2xx 抛 `http_status`（`status` + `body` 只为诊断与测试保留，上层只用 `message` 组装模型可见文案）；2xx 但 body 非 JSON 抛 `parse`；DNS / 连接失败抛 `network`，消息里按序带上 cause 链各层的 `code` 与原因（如 `ECONNREFUSED` / `ENOTFOUND` / `bad port`），不止 undici 外层的 `fetch failed`；多地址场景的 `AggregateError` 会展开（深度上限 4 层）。

## 验证局限

代理只在 Clash 混合端口上实测过，两种目标的转发形态不同：`http:` 目标走 absolute-form，不建隧道；`https:` 目标才建 CONNECT 隧道。这是 `ProxyAgent` 在 undici 8.12.3 的实测行为（`lib/dispatcher/proxy-agent.js` 的 `shouldProxyTunnel`：`proxyTunnel === true || 请求协议 !== 'http:'`），不是 API 承诺——8.7.0 就改过这段默认（见「依赖升级」）。仓库里的代理桩只覆盖前者（`test/http.test.ts` 的「http：代理」组，`test/undici-surface.test.ts` 的「不建 CONNECT 隧道」用例）。换代理软件或转发方式需重跑。

## 依赖升级

`undici` 是本模块唯一的生产依赖，而 Node 内置的 `fetch` 是它另一份拷贝——升级 npm 这份时存在两份实现并存的坑（压缩响应解不开、Bun 的 shim 缺导出，都是真实事故）。它的 minor 还会改默认行为：8.7.0 的 `fix: auto-detect HTTP proxy tunneling` 换掉了 http 目标的转发路径，随后在 `ProxyAgent` + http 目标的连接回收上崩（undici#5529）。所以按步走：

1. 逐个看 `gh release list -R nodejs/undici` 里目标区间内的 release notes，用关键词过滤改动：`proxy` / `tunnel` / `redirect` / `decompress` / `content-encoding` / `cause` / `error` / `constants` / `badPort` / `h2` / `dispatcher`。
2. 命中任一关键词，就对照上面「契约要点」判断影响面：代理转发形态、`redirect: "manual"` 的语义、`response.text()` 的解压、错误 cause 链、`badPortsSet` 路径。
3. `pnpm typecheck`（深 import 断了这里先红）→ `pnpm test`（`test/undici-surface.test.ts` 钉住四条隐式契约）。
4. 手动验三条自动化测不到的链路：http 目标经代理（应看到 absolute-form）、https 目标经代理（应建 CONNECT）、错误文案（连接拒绝 / DNS 失败 / bad port 仍带底层 code）。
5. `pnpm add -E undici@<版本>`，CHANGELOG 记一行；「无行为变更」也是有效记录。
