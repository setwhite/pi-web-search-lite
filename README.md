# pi-web-search-lite

轻量 Pi 扩展：`web_search` + `web_fetch` 两个工具，所有出站请求走同一个代理配置点。

- 设计目标、非目标与配置全貌：`docs/PLAN.md`
- 模块边界与依赖方向：`docs/ARCHITECTURE.md`
- 任务进度与验收记录：`docs/TODO.md`、`docs/VERIFICATION.md`

## 安装

```bash
# 从 npm 安装（发布后可用）
pi install npm:pi-web-search-lite

# 试用一次（不改 settings）
pi -e /path/to/pi-web-search-lite -p "hi"

# 常驻：把本地仓库装进 pi 包
pi install /path/to/pi-web-search-lite
```

也可以把 `index.ts` 放进 `~/.pi/agent/extensions/` 由宿主自动加载。生产依赖只有 `undici`（HTTP 层），宿主包与 `typebox` 是 peer 依赖，安装后无需构建。

## 配置

单个 JSON 文件：`<PI_CODING_AGENT_DIR 或 ~/.pi/agent>/pi-web-search-lite/config.json`。文件缺失时用全默认值，不报错；字段非法时启动即失败，错误文本含配置文件绝对路径与字段路径。

```json
{
  "provider": "tavily",
  "apiKeys": { "tavily": "tvly-...", "brave": "", "exa": "" },
  "proxy": "http://127.0.0.1:12450",
  "timeoutMs": 30000,
  "activation": "eager",
  "context": { "maxInlineChars": null, "maxInlineLines": null, "spillToFile": true },
  "search": { "defaultMaxResults": 5, "maxResultsLimit": 10 },
  "fetch": {
    "extractors": ["tavily", "exa", "html"],
    "minChars": 200,
    "allowRaw": true,
    "maxCharsPerPage": 150000
  },
  "handlers": { "github": { "enabled": true, "command": "gh", "timeoutMs": 10000, "maxChars": 150000 } }
}
```

字段、默认值与 clamp 区间见 `config/README.md`（上面为节选）。要点：

- **provider 解析**：`web_search` 的 `provider` 参数 > `WEB_SEARCH_PROVIDER` 环境变量 > `config.provider` > `tavily`；没有自动 fallback 链。
- **API key**：`TAVILY_API_KEY` / `BRAVE_API_KEY` / `EXA_API_KEY` 优先于 `config.apiKeys.<provider>`；缺失时直接报错并指明该配哪里。
- **activation**：`eager` 常驻工具声明；`deferred` 注册为 `deferred` + `defaultActive: false`，会话开始时把宿主内置 `tool_search` 加入激活集（宿主没有 `tool_search` 时直接激活本扩展工具并打印一行警告）。
- **guidance**：`guidance.web_search` / `guidance.web_fetch` 可覆盖 `description`、`promptSnippet`、`promptGuidelines`（后两者进系统提示）。

## 代理

`config.proxy` 是**唯一**代理配置点，刻意不读 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`；`localhost` / `127.0.0.1` / `::1` 始终直连。只支持 `http://` / `https://` 代理，`socks5://` 在配置校验阶段即被拒绝。空字符串表示强制直连。

## GitHub 前置条件（可选）

`web_fetch` 先试 GitHub 专用 handler（覆盖仓库首页、`/blob/`、`/tree/`、`/issues/N`、`/pull/N`、`/releases/tag/T`），它依赖 `gh` CLI：

```bash
gh --version && gh auth login   # handler 用 `gh repo view` 等只读命令，不需要 clone
```

`gh` 缺失或未登录时 handler 跳过，结果里会注明原因并顺延到提取器链。已知 URL 局限见 `handlers/README.md`。设置 `handlers.github.enabled: false` 可完全关闭。

## 排查

| 现象 | 原因与做法 |
|---|---|
| 启动即报「`<config path>: N invalid field(s)`」 | 按错误里的字段路径改配置；字段会严格校验，不做逐字段抢救 |
| 报缺 API key | 按错误文本设置对应环境变量，或写进 `config.apiKeys.<provider>` |
| `all extractors failed to produce usable content` | 错误里逐行列出每个提取器的原因（缺 key 跳过 / 请求失败 / 正文过短或类型不支持） |
| 结果被截断 | 超过 `context.maxInlineChars` / `maxInlineLines`（按字节）时截断，`content` 会给出临时文件绝对路径，用 `read` 继续读；不想落盘设 `context.spillToFile: false` |
| 网络请求超时或连不上 | 检查 `config.proxy`；关掉代理后目标站点不可达时错误会指向该请求 |
| 启动报 `Tool "web_search" conflicts with ...` | 与本机其它注册同名工具的扩展（如 rpiv-web-tools）重名，pi 会拒绝加载并退出；用 `tools.*.name` 改名或移除其中一个扩展 |
| `deferred` 模式工具不可见 | 扩展会在会话开始时把宿主 `tool_search` 加入激活集；宿主不提供时已直接激活本扩展工具并打印警告 |

## 开发

```bash
pnpm install
pnpm test          # vitest run
pnpm run typecheck # tsc --noEmit
```

要求 Node >= 22.19.0（与宿主 `pi` 一致，写在 `package.json` 的 `engines`）。CI（`.github/workflows/ci.yml`）在 Linux（Node 22 / 24）与 Windows（Node 22）上跑 `typecheck` + `test`；本地与 CI 的 pnpm 版本由 `packageManager` 字段锁定，测试全程不打真实网络。

模块索引：`config/`（加载校验）→ `http/`（唯一出站口）→ `ssrf/`（发请求前静态检查）→ `providers/`、`handlers/`、`extractors/`（互不依赖）→ `tools/`（编排、结果信封与 TUI 渲染）→ `index.ts`（注册）。每个目录内有一份 README 记录契约与取舍。
