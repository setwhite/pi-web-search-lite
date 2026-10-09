# pi-web-search-lite — PLAN

## 1. 为什么做

只做 `web_search` + `web_fetch`，所有出站请求必须能稳定走代理，实现 ≤ 1300 行（不含测试）。参考 pi-web-access（~15000 行 / 90+ 文件）与 rpiv-web-tools（~1500 行），剔除两者的复杂度来源：多 provider auto 链、curl 传输层、clone + 磁盘缓存。

**MVP 成功标准**

1. `pi install npm:pi-web-search-lite` 后只配 `TAVILY_API_KEY` 即可搜索与抓取（默认提取器链自动跳过无 key 的 provider）。
2. 所有出站请求（搜索、抓取、provider 原生提取）经同一代理配置点，无例外。
3. 每条失败路径给出可操作信息：缺哪个 key、缺哪个配置字段、HTTP 状态、超时来源。
4. 结果超限自动截断，完整内容落到临时文件，`content` 里写明路径。

## 2. 选什么

### 2.1 搜索：三个 provider，显式选择，无自动 fallback

- 白名单：`tavily`（默认）、`brave`、`exa`。
- provider 解析优先级（first wins）：`web_search` 的 `provider` 参数 > `WEB_SEARCH_PROVIDER` > `config.provider` > `"tavily"`。
- key 解析优先级：per-provider 环境变量（`TAVILY_API_KEY` / `BRAVE_API_KEY` / `EXA_API_KEY`）> `config.apiKeys[provider]`。
- 选中 provider 无 key、或 `provider` 不在白名单 → 抛错并写明去哪配、配哪个变量名。不静默换 provider。

理由：rpiv 已证明薄 provider 层 + 显式选择可维护；pi-web-access 的 auto 链是其最大复杂度来源，且失败时模型只看到一句汇总错误。

### 2.2 抓取：可配置的提取器链

- `tavily`：POST `https://api.tavily.com/extract`（Bearer key）。
- `exa`：POST `https://api.exa.ai/contents`（`x-api-key`）。
- `html`：本地 `fetch` + 正则五步法（剥 script/style/noscript → 块级标签转换行 → 去标签 → 解实体 → 压空白），零依赖。

按配置顺序逐个尝试，第一个产出合格内容的赢。Fallback 三语义：该提取器需要 key 但没配 → **跳过**（不计失败、不发请求）；抛错（非 2xx、超时、二进制内容）→ 记因试下一个；结果 < `fetch.minChars`（默认 200）→ 视为无效，记因试下一个。全部失败时汇总每个提取器名字 + 失败原因，而不是只报最后一个。`raw: true` 跳过整链，直接返回原始 body。

理由：沿用 pi-web-access 已验证的 `MIN_USEFUL_CONTENT` + 失败顺延，但只保留"两个原生 + 一个本地"，用户能一眼看懂链会走哪几步。

### 2.3 专用页面 handler：GitHub 走 `gh` CLI

`web_fetch` 的第 0 步。命中且成功 → 跳过整条提取器链；未命中或失败 → 顺延到链，并在结果里注明 handler 名与顺延原因（透明顺延，不是静默降级）。

- 接口：`match(url) => boolean` + `run(url, ctx) => Promise<HandlerResult | null>`，返回 `null` 表示未处理。注册表按序匹配，MVP 只有 `github`。
- `gh` 可用性：进程内缓存一次 `gh --version` + `gh auth status` 的结果；不可用则整个 handler 跳过，不做逐 URL 探测。
- 子进程：`execFile("gh", args, { timeout: 10s, maxBuffer: 10MB, signal, env })`，env 带 `GH_PROMPT_DISABLED=1`、`GIT_TERMINAL_PROMPT=0`；配置了 `proxy` 时注入 `HTTPS_PROXY` / `HTTP_PROXY`（gh 认这两个变量），`localhost` 例外规则同样适用。
- 输出：统一转 markdown，单次上限 `MAX_HANDLER_CHARS = 150_000`（对齐 pi-web-access 的 `MAX_DOC_CHARS`），超出交给工具层截断。

URL 形态 → 命令（实现时以本机 gh 版本支持的字段为准）：

| URL | 命令 |
|---|---|
| `github.com/O/R` | `gh repo view O/R` + `gh api repos/O/R/readme --jq .content` |
| `/blob/REF/PATH` | `gh api -H "Accept: application/vnd.github.raw" repos/O/R/contents/PATH?ref=REF` |
| `/tree/REF/PATH` | `gh api repos/O/R/git/trees/REF?recursive=1 --jq '.tree[].path'`（上限 200 条） |
| `/issues/N` | `gh issue view N --repo O/R --json ...`（字段集照抄 pi-web-access 的 `ISSUE_FIELDS` 与 core 字段回退） |
| `/pull/N` | `gh pr view N --repo O/R --json ...`；`/files` 子路径走 `gh pr diff` |
| `/releases/tag/T` | `gh release view T --repo O/R` |
| wiki / actions / discussions / gist / 其他 | 不拦，走提取器链 |

理由：单页内容由 `gh` 直接返回清洗文本，省掉 clone 生命周期、磁盘缓存、tree 全量展开（参考实现为此各写了 890 / 1063 行）；issue/PR 两边都没有 clone 路线，pi-web-access 已用 `gh ... view --json` 验证可行。

### 2.4 代理：配置唯一入口

- `config.proxy`（可选）形如 `http://127.0.0.1:7890`；空字符串 = 强制直连。
- **不读** `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`；`localhost` / `127.0.0.1` / `::1` 永远绕过代理。
- 实现：`undici` + `ProxyAgent`，作为 `dispatcher` 传给同一个 fetch 包装器；所有模块只经该包装器发请求，禁止散落的直接 `fetch`。
- 只支持 `http:` / `https:` 代理；socks5 在配置校验阶段报错（本期不做 curl 传输，避免外部二进制依赖）。

理由：目标场景的 Clash / V2Ray 都提供 http 代理端口；pi-web-access 为此替换全局 `fetch` 成 curl 子进程适配层（~200 行），可省。

### 2.5 配置：单 JSON 文件 + 可选环境变量

- 路径：`PI_CODING_AGENT_DIR` > `~/.pi/agent`，文件名 `pi-web-search-lite.json`（不与 pi-web-access 的 `web-search.json` 冲突）。
- 文件不存在 = 全默认值 + 环境变量 key，不报错。
- 完整配置面（JSON 无注释，此处仅为说明）：

```jsonc
{
  "provider": "tavily",
  "apiKeys": { "tavily": "...", "brave": "...", "exa": "..." },
  "proxy": "http://127.0.0.1:7890",
  "timeoutMs": 30000,                             // * 单次 HTTP 超时，clamp 1_000–120_000
  "userAgent": "pi-web-search-lite/1.0",           // * 抓取 UA；默认值包含包版本
  "tools": {                                      // * 工具注册与命名
    "web_search": { "enabled": true, "name": "web_search" },
    "web_fetch":  { "enabled": true, "name": "web_fetch" }
  },
  "activation": "eager",                           // * eager | deferred
  "guidance": {                                    // * 上下文文案覆盖（字段同 rpiv 的 GuidanceFields）
    "web_search": { "description": "...", "promptSnippet": "...", "promptGuidelines": ["..."] },
    "web_fetch":  { "description": "...", "promptSnippet": "...", "promptGuidelines": ["..."] }
  },
  "context": {                                    // * 单次结果进入模型的体积上限
    "maxInlineChars": null,                        // null = 用宿主 DEFAULT_MAX_BYTES；clamp 1_000–宿主上限
    "maxInlineLines": null,                        // null = 用宿主 DEFAULT_MAX_LINES；clamp 50–宿主上限
    "spillToFile": true
  },
  "search": {
    "defaultMaxResults": 5,                        // * clamp 1–maxResultsLimit
    "maxResultsLimit": 10                          // * clamp 1–20
  },
  "fetch": {
    "extractors": ["tavily", "exa", "html"],
    "minChars": 200,
    "allowRaw": true,                              // * 是否允许 raw 参数与 raw 模式
    "maxCharsPerPage": 150000                      // * 单页提取后的硬上限
  },
  "handlers": {
    "github": { "enabled": true, "command": "gh", "timeoutMs": 10000, "maxChars": 150000 }
  }
}
```

- 校验：逐字段检查白名单枚举、数值区间、字符串非空；`tools.*.name` 以字母开头、只含字母数字下划线连字符、互不重复、不占宿主保留名；两个工具不能都关（报错，而非静默注册空扩展）。任何一条不满足 → 报错并带文件路径与字段路径。
- **严格失败**，不做 rpiv 式逐字段 salvage：配置面虽宽，静默丢字段比报错更难排查。

### 2.6 工具注册与上下文：每个影响上下文的开关都可配

| 配置 | 影响 |
|---|---|
| `tools.*.enabled: false` | 根本不注册该工具，上下文里没有任何痕迹 |
| `tools.*.name` | 工具名（同时决定系统提示与错误文案里引用的名字） |
| `activation: "eager"` | 注册为 `exposure: "direct"`，工具声明与参数 schema 常驻上下文 |
| `activation: "deferred"` | 注册为 `exposure: "deferred"` + `defaultActive: false`，不占常驻上下文；启动时把内置 `tool_search` 加入激活集（`pi.setActiveTools`），由它按需发现并激活 |
| `guidance.*.promptSnippet` | 工具列表里的一行短语 |
| `guidance.*.promptGuidelines` | 系统提示 rules 里的条目（数组，逐条替换） |
| `guidance.*.description` | 工具描述的整段覆盖 |
| `context.maxInlineChars` / `maxInlineLines` | 单次工具结果进入模型的上限，超出走 `spillToFile` |
| `search.defaultMaxResults` | 模型不传 `max_results` 时的默认条数 |

理由：`promptSnippet` / `promptGuidelines` 是 Pi 工具定义的真实字段（`examples/extensions/tic-tac-toe.ts:864`），rpiv 已把两者做成配置（`GuidanceFields`）。deferred 只调一次 `pi.setActiveTools` 激活内置 `tool_search`（不存在则退回 eager + 一行警告），不自建 loader、不处理 checkpoint —— transcript 重发是宿主职责。

### 2.7 内容超限与安全边界

- 搜索与抓取统一截断：上限取 `context.maxInlineChars` / `maxInlineLines`（默认即宿主导出的 `DEFAULT_MAX_BYTES` / `DEFAULT_MAX_LINES`），经 `truncateHead` 执行；被截断且 `spillToFile` 为真时用 `withFileMutationQueue` 写入 `mkdtemp(tmpdir(), "pi-web-search-lite-")` 下的文件，并在 `content` 与 `details.fullOutputPath` 中告知模型。
- 最小 SSRF 防护（发布必要条件，仅静态判定，不解析 DNS）：只允许 `http:` / `https:`；拒绝回环 / 私有网段 / link-local / `169.254.169.254` / `.local` / `localhost` 等主机名与字面量 IP；禁止 30x 跳到非 http(s)。

### 2.8 工具契约

- `web_search`：`query` 必填，`max_results`（clamp 到 1–`search.maxResultsLimit`，默认 `search.defaultMaxResults`），`provider` 可选覆盖；返回统一信封：provider 名、结果列表（标题 / URL / 摘要）、失败原因。名字取 `tools.web_search.name`。
- `web_fetch`：`url` 必填，`raw` 可选（仅当 `fetch.allowRaw` 为真时进 schema）；返回正文 + 来源（标题、URL、用到的 handler 或提取器、字符数、截断状态）。`raw: true` 与专用 handler 互斥，github handler 不接管。名字取 `tools.web_fetch.name`。
- 两者 `description` 写明超限行为与续读方式；`details` 承载 UI 与状态重建所需的结构化数据，不进模型上下文。错误一律 `throw`（宿主标记为失败结果），不在 `content` 里假装成功。

## 3. 不做什么

| 不做 | 理由 |
|---|---|
| Tavily keyless、任何免 key provider | 参考实现都没有；免 key 源（DDG HTML、公共 SearXNG）脆弱且可能违反 ToS |
| 搜索自动 fallback 链、`auto` / `all` / `routing` | pi-web-access 复杂度的主要来源；显式选择让失败原因唯一 |
| responseId、`get_search_content` 分页、结果持久化 | "截断 + 临时文件"已覆盖续读；真有需求再加存储层 |
| curator、摘要模型调用、answer 模式 | 与"1300 行内可读"冲突 |
| MCP server、core/host 分层、自建 loader（`web_enable`）、checkpoint 判定 | 只有一个宿主；deferred 复用宿主内置 `tool_search`，工具变更的 transcript 是宿主职责 |
| 斜杠命令 / TUI picker | 改 JSON + 精确错误文案足够；列入 Phase 2 |
| `outputSchema` / `structuredContent` | 需 schema 与实现严格同步，收益在 codemode 场景；列入 Phase 2 |
| GitHub clone / 磁盘缓存 / tree 全量展开 | `gh` 单次调用已覆盖 6 类页面；不提前建缓存层，真出现整仓浏览需求再在 Phase 2 评估 |
| gist / discussions / wiki / actions 的专用处理 | URL 形态零碎、使用率低；顺延到提取器链即可 |
| SSRF 的 DNS 解析与重绑定检测、PDF / 图片 / YouTube 专用路径 | pi-web-access 用 547 行 + 多个专用模块实现，与轻量目标冲突 |

## 4. 阶段划分

- **Phase 1 — MVP**：即 TODO 的 T1–T8，每条一次会话可完成。包骨架 → 配置 → HTTP + SSRF → provider → handler → 提取器 → 工具层 → 入口注册与文档 → 安全与回归测试。
- **Phase 2 — 常用扩展**：`recency` / 域名过滤参数、`/web-search --show` 配置展示、`outputSchema`、Jina Reader 作为第四个提取器、`searchRouting` 式多 provider 并发、GitHub 整仓浏览（clone + 磁盘缓存 + tree 展开）按需求评估。
- **Phase 3 — 发布**：GitHub 仓库与 CI、npm 发布、pi package manifest 校验、多平台（Windows/macOS/Linux）手动验收清单。

## 5. 待确认

包名 `pi-web-search-lite`（npm 未被占用）、项目目录 `C:/Users/Charles Liu/Desktop/test/pi-web-search-lite/`、配置文件 `~/.pi/agent/pi-web-search-lite.json`；其余默认值见 §2.5。
