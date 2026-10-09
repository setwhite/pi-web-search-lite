# pi-web-search-lite — PLAN（设计）

目标、选型理由与明确不做的事。字段与契约分别见 `config/README.md` 与各模块 README，依赖与目录约定见 `docs/ARCHITECTURE.md`，进度见 `docs/TODO.md`。

## 1. 为什么做

只做 `web_search` + `web_fetch`，所有出站请求必须能稳定走代理。参考 pi-web-access（~15000 行 / 90+ 文件）与 rpiv-web-tools（~1500 行），剔除两者的复杂度来源：多 provider auto 链、curl 传输层、clone + 磁盘缓存。

**MVP 成功标准**

1. `pi install npm:pi-web-search-lite` 后只配 `TAVILY_API_KEY` 即可搜索与抓取（默认提取器链自动跳过无 key 的 provider）。
2. 所有出站请求（搜索、抓取、provider 原生提取）经同一代理配置点，无例外。
3. 每条失败路径给出可操作信息：缺哪个 key、缺哪个配置字段、HTTP 状态、超时来源。
4. 结果超限自动截断，完整内容落到临时文件，`content` 里写明路径。

## 2. 选型

### 2.1 搜索：三个 provider，显式选择

白名单 `tavily`（默认）/ `brave` / `exa`；解析优先级与 key 规则见 `providers/README.md`。选中 provider 无 key、或名字不在白名单 → 抛错写明去哪配哪个键，**不静默换 provider**。

理由：rpiv 已证明薄 provider 层 + 显式选择可维护；pi-web-access 的 auto 链是其最大复杂度来源，失败时模型只看到一句汇总错误。

### 2.2 抓取：可配置的提取器链

`fetch.extractors` 里的提取器按顺序逐个尝试，第一个产出合格内容的赢。默认顺序 `html` 打头——本地提取、不需要 key，失败或内容不合格再顺延到 provider 提取器（该字段可自行重排）；跳过 / 顺延 / `minChars` 三条语义与全败时的原因汇总见 `extractors/README.md`。`raw: true` 跳过整链。

理由：沿用 pi-web-access 已验证的 `MIN_USEFUL_CONTENT` + 失败顺延，但只保留「两个原生 + 一个本地」，用户能一眼看懂链会走哪几步。

### 2.3 专用页面 handler：GitHub 走 `gh` CLI

`web_fetch` 的第 0 步：命中且成功 → 跳过整条链；未命中或失败 → 顺延到链并注明 handler 名与顺延原因（透明顺延，不是静默降级）。URL 形态、`gh` 子进程约定与已知局限见 `handlers/README.md`。

理由：单页内容由 `gh` 直接返回清洗文本，省掉 clone 生命周期与磁盘缓存（参考实现为这两项各写了 890 / 1063 行）。

### 2.4 代理：配置唯一入口

`config.proxy`（可选）是唯一代理配置点，空串 = 强制直连；**不读** `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`，本机目标永远绕过；只支持 `http:` / `https:` 代理，socks5 在配置校验阶段报错（本期不做 curl 传输，避免外部二进制依赖）。实现见 `http/README.md`。

理由：目标场景的 Clash / V2Ray 都提供 http 代理端口；pi-web-access 为此把全局 `fetch` 替换成 curl 子进程适配层（~200 行），可省。

### 2.5 配置：单 JSON 文件 + 可选环境变量

路径 `<agent dir>/pi-web-search-lite/config.json`（独立目录，不与 pi-web-access 的 `web-search.json` 冲突）；文件不存在 = 全默认值 + 环境变量 key，不报错；任何字段非法 → 报错并带文件绝对路径与字段路径。**严格失败**，不做 rpiv 式逐字段 salvage——配置面虽宽，静默丢字段比报错更难排查。字段、默认值与 clamp 区间见 `config/README.md`。

### 2.6 上下文控制：每个影响上下文的开关都可配

| 配置 | 影响 |
|---|---|
| `tools.*.enabled: false` | 根本不注册该工具，上下文里没有任何痕迹 |
| `tools.*.name` | 工具名（同时决定系统提示与错误文案里引用的名字，默认提示词按它组装） |
| `activation: "eager"` | 注册为 `exposure: "direct"`，工具声明与参数 schema 常驻上下文 |
| `activation: "deferred"` | 注册为 `exposure: "deferred"` + `defaultActive: false`，不占常驻上下文；`session_start` 把宿主内置 `tool_search` 加入激活集，由它按需发现并激活 |
| `guidance.*.promptSnippet` | 工具列表里的一行短语覆盖 |
| `guidance.*.promptGuidelines` | 系统提示 rules 条目的整组覆盖 |
| `guidance.*.description` | 工具描述的整段覆盖 |
| `context.maxInlineChars` / `maxInlineLines` | 单次工具结果进入模型的上限，超出走 `spillToFile`（按字节截断） |
| `search.defaultMaxResults` | 模型不传 `max_results` 时的默认条数 |

理由：`promptSnippet` / `promptGuidelines` 是 Pi 工具定义的真实字段，rpiv 已把两者做成配置（`GuidanceFields`）。deferred 在会话开始时只调一次 `pi.setActiveTools`（宿主不提供 `tool_search` 则直接激活本扩展工具 + 一行警告；加载期不调用动作方法），不自建 loader、不处理 checkpoint——transcript 重发是宿主职责。

### 2.7 内容超限与安全边界

搜索与抓取统一截断，契约见 `tools/README.md` §信封与截断。SSRF 只做发请求前的静态判定（协议 / 主机名 / 字面量 IP），不解析 DNS；范围与例外见 `ssrf/README.md`。

### 2.8 工具契约

两个工具的入参、返回信封与 `details` 形状见 `tools/README.md`。错误一律 `throw`（宿主标记为失败结果），不在 `content` 里假装成功。面向模型的文案保持英文单行：能在报错或结果文案里现学的行为契约（截断续读、provider 解析、clamp、失败条件）不写进 `description`。

## 3. 不做什么

| 不做 | 理由 |
|---|---|
| Tavily keyless、任何免 key provider | 参考实现都没有；免 key 源（DDG HTML、公共 SearXNG）脆弱且可能违反 ToS |
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

- **Phase 1 — MVP**：TODO 的 T1–T8。包骨架 → 配置 → HTTP + SSRF → provider → handler → 提取器 → 工具层 → 入口注册与文档 → 安全与回归测试。
- **Phase 2 — 常用扩展**：`recency` / 域名过滤参数、`/web-search --show` 配置展示、`outputSchema`、Jina Reader 作为第四个提取器、`searchRouting` 式多 provider 并发、GitHub 整仓浏览（clone + 磁盘缓存 + tree 展开）按需求评估。
- **Phase 3 — 发布**：GitHub 仓库与 CI（T11）、npm 发布（T12）、pi package manifest 校验、多平台手动验收清单。

## 5. 项目坐标（已确认）

包名 `pi-web-search-lite`（npm 未被占用）、项目目录 `C:/Users/Charles Liu/Desktop/test/pi-web-search-lite/`、配置文件 `~/.pi/agent/pi-web-search-lite/config.json`；各字段默认值与 clamp 区间见 `config/README.md`。
