# http/ — 扩展自身出站 HTTP 的唯一出口

代理、超时、UA、`AbortSignal`、错误归一化。**不认 provider 语义、不 import 宿主包**；全仓库只有这一个模块直接调用 `undici` 的 `fetch`，gh 子进程不走本模块（见 [handlers.md](handlers.md)）。

API、错误类型与逐条契约在 `http/index.ts`，由 `test/http.test.ts` 与 `test/undici-surface.test.ts` 钉住；本文不复述。跨模块只有两条约定：入口 URL 的 SSRF 校验由调用方在抓取前完成，本模块只校验重定向的每一跳；代理只认 `config.proxy`，不读 `HTTP_PROXY` 等环境变量（[ADR-0004](../adr/0004-single-proxy-setting.md)）。

## 代理回退与冷却

有代理时先走代理，传输层失败改直连重试一次；连续 3 次失败后 60 秒内只直连，到期放行一次探测（[ADR-0013](../adr/0013-proxy-fallback-direct.md)）。取舍与坑：

- 状态按进程共享，按 `proxy` 串重置：`createHttpClient` 每次工具调用都新建，计数放 client 里永远到不了阈值；`/reload` 换了 `proxy` 就重新数。
- 只回退 `network` / `timeout`。`http_status` 不回退，所以代理自己回 `502` / `407` 时会被当成目标错误——已知盲点，不是漏写。
- 每次尝试各有一份 `timeoutMs`，最坏延迟是两份之和（默认 60 秒）。
- 拿到响应后不回退：读体失败重发会重复副作用。
- 降级提示由 `proxyNotice` 产出，`tools/` 往结果头加一行；粒度是状态级，不是每次回退都报。

回退用例注入传输层（`HttpClientOptions.fetchImpl`）与时钟（`now`），不依赖 DNS 与真代理；代理转发形态仍由「http：代理」组的真代理桩覆盖。

## 验证局限

代理只在 Clash 混合端口上实测过，两种目标的转发形态不同：`http:` 目标走 absolute-form，不建隧道；`https:` 目标才建 CONNECT 隧道。这是 `ProxyAgent` 在 undici 8.12.3 的实测行为（`lib/dispatcher/proxy-agent.js` 的 `shouldProxyTunnel`：`proxyTunnel === true || 请求协议 !== 'http:'`），不是 API 承诺——8.7.0 就改过这段默认（见「依赖升级」）。仓库里的代理桩只覆盖前者（`test/http.test.ts` 的「http：代理」组，`test/undici-surface.test.ts` 的「不建 CONNECT 隧道」用例）。换代理软件或转发方式需重跑。

## 依赖升级

`undici` 是本模块唯一的生产依赖，而 Node 内置的 `fetch` 是它另一份拷贝——升级 npm 这份时存在两份实现并存的坑（压缩响应解不开、Bun 的 shim 缺导出，都是真实事故）。它的 minor 还会改默认行为：8.7.0 的 `fix: auto-detect HTTP proxy tunneling` 换掉了 http 目标的转发路径，随后在 `ProxyAgent` + http 目标的连接回收上崩（undici#5529）。所以按步走：

1. 逐个看 `gh release list -R nodejs/undici` 里目标区间内的 release notes，用关键词过滤改动：`proxy` / `tunnel` / `redirect` / `decompress` / `content-encoding` / `cause` / `error` / `constants` / `badPort` / `h2` / `dispatcher`。
2. 命中任一关键词，就对照 `http/index.ts` 的契约与 `test/http.test.ts` 的用例判断影响面：代理转发形态、`redirect: "manual"` 的语义、`response.text()` 的解压、错误 cause 链、`badPortsSet` 路径。
3. `pnpm typecheck`（深 import 断了这里先红）→ `pnpm test`（`test/undici-surface.test.ts` 钉住四条隐式契约）。
4. 手动验三条自动化测不到的链路：http 目标经代理（应看到 absolute-form）、https 目标经代理（应建 CONNECT）、错误文案（连接拒绝 / DNS 失败 / bad port 仍带底层 code）。
5. `pnpm add -E undici@<版本>`，CHANGELOG 记一行；「无行为变更」也是有效记录。
