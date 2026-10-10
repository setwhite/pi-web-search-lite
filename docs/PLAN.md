# pi-web-search-lite — PLAN（设计）

目标、选型理由与明确不做的事。字段与契约分别见 `config/README.md` 与各模块 README，依赖与目录约定见 `docs/ARCHITECTURE.md`，进度见 `docs/TODO.md`。

## 1. 为什么做

只做 `web_search` + `web_fetch`，所有出站请求必须能稳定走代理。参考 pi-web-access（~15000 行 / 90+ 文件）与 rpiv-web-tools（~1500 行），剔除两者的复杂度来源：多 provider auto 链、curl 传输层、clone + 磁盘缓存。

**MVP 成功标准**

1. `pi install npm:pi-web-search-lite` 后搜一次只需配 `TAVILY_API_KEY`（或任一 provider key，缺 key 直接报错指明去哪配）；抓取零配置即可用——默认链 `html` / `jina` 都不需要 key。
2. 所有出站请求（搜索、抓取、provider 原生提取）经同一代理配置点，无例外。
3. 每条失败路径给出可操作信息：缺哪个 key、缺哪个配置字段、HTTP 状态、超时来源。
4. 结果超限自动截断，完整内容落到临时文件，`content` 里写明路径。

## 2. 选型

一条决策一行：`决策 | 一句话理由 | 详细出处`。字段、签名与异常归对应模块 README，本文不复述；与参考实现的取舍对照见 §3。

| # | 决策 | 一句话理由 | 详细出处 |
|---|---|---|---|
| 2.1 | 搜索白名单五个 provider（默认 `tavily`）；选中者缺 key 或名字不在白名单 → 抛错，不静默换源 | 显式选择让失败原因唯一；perplexity 用返回原始排名结果的 Search API，不引入 answer 模式 | `providers/README.md` |
| 2.2 | 抓取按 `fetch.extractors` 顺序逐链尝试，默认 `html` → `jina`；`raw: true` 跳过整链 | 默认两位都不需要 key 也不额外计费；沿用已验证的 `minChars` 门槛 + 失败顺延；provider 提取器要显式加进来 | `extractors/README.md` |
| 2.3 | GitHub 页面在 `web_fetch` 第 0 步交给 `gh` handler，未命中或失败透明顺延到链 | gh 单次调用直接产出清洗正文，省掉 clone 生命周期与磁盘缓存 | `handlers/README.md` |
| 2.4 | `config.proxy` 是唯一代理配置点；不读 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`，本机目标永远绕过；socks5 在配置校验阶段报错 | 目标场景的 Clash / V2Ray 都提供 http 代理端口，可免去 curl 传输层与外部二进制依赖 | `http/README.md` |
| 2.5 | 单 JSON 文件 + 环境变量注入 key；文件缺失 = 全默认值，字段非法 = 抛错，不做逐字段 salvage | 配置面宽，静默丢字段比报错更难排查 | `config/README.md` |
| 2.6 | 影响上下文的开关（`tools.*`、`activation`、`guidance.*`、截断上限、默认结果数）全部可配 | deferred 复用宿主内置 `tool_search`，不自建 loader、不处理 checkpoint | `config/README.md`、`tools/README.md` |
| 2.7 | 搜索与抓取统一截断 + 全文落临时文件续读；SSRF 只做发请求前的静态判定，不解析 DNS | 轻量目标优先；DNS 重绑定检测成本高、收益低，列入 §3 非目标 | `tools/README.md` §信封与截断、`ssrf/README.md` |
| 2.8 | 错误一律 `throw`；模型可见文案英文单行，能在报错里现学的行为不写进 `description` | 宿主把 throw 标记为失败结果；提示词只留无法从报错现学的信息 | `tools/README.md` |

## 3. 不做什么

| 不做 | 理由 |
|---|---|
| Tavily keyless、任何免 key 搜索源 | 参考实现都没有；免 key 源（DDG HTML、公共 SearXNG）脆弱且可能违反 ToS。**例外**：`jina` 提取器允许无 key（官方 20 RPM），它只做抓取、不是搜索源，不会让搜索在未配 key 时静默工作 |
| 搜索自动 fallback 链、`auto` / `all` / `routing` | pi-web-access 复杂度的主要来源；显式选择让失败原因唯一 |
| responseId、`get_search_content` 分页、结果持久化 | "截断 + 临时文件"已覆盖续读；真有需求再加存储层 |
| curator、摘要模型调用、answer 模式 | 偏离轻量目标与单一职责 |
| MCP server、core/host 分层、自建 loader（`web_enable`）、checkpoint 判定 | 只有一个宿主；deferred 复用宿主内置 `tool_search`，工具变更的 transcript 是宿主职责 |
| 斜杠命令 / TUI picker | 改 JSON + 精确错误文案足够；列入 Phase 2 |
| `outputSchema` / `structuredContent` | 需 schema 与实现严格同步，收益在 codemode 场景；列入 Phase 2 |
| GitHub clone / 磁盘缓存 / tree 全量展开 | `gh` 单次调用已覆盖 6 类页面；不提前建缓存层，真出现整仓浏览需求再在 Phase 2 评估 |
| gist / discussions / wiki / actions 的专用处理 | URL 形态零碎、使用率低；顺延到提取器链即可 |
| SSRF 的 DNS 解析与重绑定检测、PDF / 图片 / YouTube 专用路径 | pi-web-access 用 547 行 + 多个专用模块实现，与轻量目标冲突 |

## 4. 阶段划分

- **Phase 1 — MVP**：完成；任务台账与验收证据 `docs/TODO.md`。
- **Phase 2 — 常用扩展**：`recency` / 域名过滤参数、`/web-search --show` 配置展示、`outputSchema`、多 provider 并发搜索、GitHub 整仓浏览（clone + 磁盘缓存 + tree 展开），按需求评估后在 `docs/TODO.md` 开卡。
- **Phase 3 — 发布**：完成；CI（T11）与 OIDC 自动发布（T12）已落地，证据见 `docs/TODO.md` T11 / T12。
