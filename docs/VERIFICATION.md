# 手动验收记录

本文件只存一次性实测记录（时间 / 环境 / 命令 / 实际结果）；自动化断言见 `test/`，验收状态见 `docs/TODO.md`。

- 环境（除注明外）：Windows + Node v26.7.0 + pnpm 12.3.4 + pi 1.1.0；`gh` 2.93.0（已 `gh auth login`，账号 setwhite）；本地代理 `http://127.0.0.1:12450`
- 命令形态：`PI_CODING_AGENT_DIR=<临时目录> pi --extension ./index.ts -p "<prompt>"`
- 隔离 agent dir = 真实 `auth.json` 副本 + 只含 `defaultProvider` / `defaultModel` / `defaultThinkingLevel` / `defaultTools` 的 `settings.json`，不引用任何 npm 扩展。**原因**：本机装有 rpiv-web-tools（同样注册 `web_search` / `web_fetch`），默认工具名冲突会让 pi 直接 EXIT=1；隔离目录可完整复现目标行为。
- 每次运行前写入 `<临时目录>/pi-web-search-lite/config.json`（不测配置项时删除该文件）。
- **§1–§3 是 2026-10-09（T8）的中文文案快照**，T10 把运行时文案改为英文后已过期；历史记录保留原样，重跑以当前英文文案为准。

## 1. 配置矩阵与代理开关（2026-10-09，T8）

| # | 配置 | 预期 | 实际结果 |
|---|---|---|---|
| 1 | 无 config.json | 注册两个工具 | `codemode` 列出 `read, bash, edit, write, web_search, web_fetch`，EXIT=0 |
| 2 | `tools.web_search.name=lite_web_search`、`tools.web_fetch.enabled=false` | 改名生效、禁用的不注册 | 列表 `read, bash, edit, write, lite_web_search`，EXIT=0 |
| 3 | 无 proxy | 抓取失败且原因指向网络 | 提取器链全败：`tavily` / `exa` 跳过（缺 key），`html` 失败：`网络错误：GET https://example.com/：fetch failed`，EXIT=0 |
| 4 | `proxy=http://127.0.0.1:12450` | 抓 `https://example.com/` 成功 | 标题 `Example Domain`，EXIT=0 |
| 5 | config.json 写入 `{ 不是 JSON` | 启动失败，错误含绝对路径 | EXIT=1，`配置文件 <临时目录>/pi-web-search-lite/config.json 不是合法 JSON：Expected property name or '}' in JSON at position 2` |
| 6 | `proxy=socks5://127.0.0.1:12450` | 校验期拒绝 | EXIT=1，`proxy：只支持 http/https 代理，实际 socks5://` |
| 7 | 不配 key 直接调 `web_search` | 报缺 key 并指明配置位置 | `provider "tavily" 缺少 API key：请设置环境变量 TAVILY_API_KEY，或在配置文件的 config.apiKeys.tavily 字段填写。` |

## 2. GitHub handler 开启 / 关闭（2026-10-09，T8）

URL 固定 `https://github.com/octocat/Hello-World`，均带代理。

| # | 配置 | 预期 | 实际结果 |
|---|---|---|---|
| 8 | 默认（handler 开） | 命中 handler，不走提取器链 | 模型回报由 GitHub 专用 handler 抓取、未顺延 tavily/exa/html，内容含仓库说明与 star 数，EXIT=0 |
| 9 | `handlers.github.enabled=false` | 顺延提取器链并注明跳过原因 | 正文含 `提取方式：提取器 html` 与 `github handler 未接管：handlers.github.enabled 为 false`，EXIT=0 |

## 3. deferred 模式（2026-10-09，T8）

| # | 配置 | 预期 | 实际结果 |
|---|---|---|---|
| 10 | `activation=deferred`，不激活任何工具 | 工具不在列表、`tool_search` 可用 | 模型列出 6 个可用工具并明确 `web_fetch` 不可用；`tool_search` 在列（由扩展在 `session_start` 激活），EXIT=0 |
| 11 | 同上，要求先 `tool_search` 再抓取 | 发现 → 激活 → 调用成功 | 模型经 `tool_search` 激活后抓取成功，回答标题 `Example Domain`；中途因正文 156 < `fetch.minChars` 200 先报「内容过短」，改用 `raw: true` 拿到页面（错误文本确实引导了下一步），EXIT=0 |

**本轮发现的真实缺陷（已修）**：初版 `index.ts` 在扩展加载期调用 `pi.getAllTools()` / `setActiveTools()`，宿主抛 `Extension runtime not initialized. Action methods cannot be called during extension loading.`（`dist/core/extensions/loader.js` 的 `commit()` 之前动作方法不可用），deferred 配置直接 EXIT=1。修复为在 `pi.on("session_start", ...)` 里探测并激活，单测同步改为注入假 `on` / 事件；M10、M11 为修复后的实测。

## 4. 自动化回归（2026-10-09，T8 同提交）

- `pnpm test`：22 个文件 209 例全绿；`pnpm run typecheck` 通过。
- `test/regression/chain.test.ts`：真实 `createHttpClient` 不走 fake——搜索经桩 server 校验 `POST /search`、Bearer、body 与统一信封；抓取经桩代理（CONNECT 隧道回 HTML）完成 handler 未命中 → html 提取 → 截断落盘 → `details.fullOutputPath` 文件内容等于完整正文且正文提示已截断。
- `test/regression/security.test.ts`：12 条 SSRF 黑名单（回环 / IPv6 映射 / 私有段 / link-local / `*.local` / `file:` / `ftp:`）在工具入口逐条拒绝且零请求；公网域名放行。
- `test/regression/messages.test.ts`：缺 key、非法配置值、坏 JSON、gh 未安装、gh 未登录、提取器全败六类文案。

## 5. 真实 API 冒烟（2026-10-09 18:39，T7 补测）

key 取自本机 `~/.config/rpiv-web-tools/config.json` 的 tavily / exa，经环境变量 `TAVILY_API_KEY` / `EXA_API_KEY` 注入进程，未写入任何文件；其余条件同第 1 节（隔离 agent dir + 代理 `http://127.0.0.1:12450`）。

| # | 调用 | 实际结果 |
|---|---|---|
| S1 | `web_search` 默认 provider，query `pi coding agent` | 3 条结果：Wikipedia / 第三方评测 / YouTube，均带真实链接，EXIT=0 |
| S2 | `web_search` + `provider: "exa"` | provider 显示 `exa`，返回 `pi.dev` 官网 / 文档 / GitHub 仓库 3 条，EXIT=0 |
| S3 | `web_fetch` 抓 `https://pi.dev/docs/latest` | 标题 `Pi · Documentation · Pi`，`提取方式：提取器 tavily`（真实 Tavily `/extract`），EXIT=0 |

## 6. TUI 真机复核与文案英文化（2026-10-09，T9 / T10，commit `d147d9b`）

- T9 / T10 的「交互式真机目测」由审计以 ConPTY 实机捕获复核：调用行、折叠 / 展开、失败态、截断标记与语义色全部命中，故两项验收勾选完成。
- T10 真机（`-p` + 隔离 agent dir）：缺 key 报英文错误且 EXIT=0；真实 `web_fetch` / `web_search` 信封为 `# Example Domain` / `Source:` / `Extracted by: extractor exa` / `web_search: 2 results (provider: tavily, max_results: 2)`。
- 同提交 `pnpm test`：23 文件 225 例全绿。

## 7. CI 首次运行（2026-10-09，T11）

- 触发：main 推送；run `37938649108`，3 个 job 全绿——ubuntu/Node 24 21s、ubuntu/Node 22 22s、windows/Node 22 41s。
- 每格日志均为 `Test Files 23 passed` + `Tests 225 passed`；全程不打真实网络（provider / 提取器用桩 server 与注入的 exec）。
- 未验：`pull_request` 触发已配置，待首个 PR。

## 8. npm 发布与安装复核（2026-10-09，T12）

- `npm pack` 产物 36 文件 / 42.1 kB；`test/`、`docs/`、`tsconfig.json`、`pnpm-lock.yaml`、`.github/` 均不入包。
- 解包后直接跑 pi 冒烟通过：`web_fetch https://example.com`（提取器 tavily）+ `web_search "pi coding agent"` 2 条，证明 `files` 白名单无缺漏。
- `pnpm publish --access public` 成功（用户执行，2026-10-09T14:56:41Z，maintainer `setwhite`）。
- 注册表侧复核：`version 0.1.0`、`dist.shasum a1541c7e4418f3be2cb0d1ea75fdb714dcdaee9b`、`dist.integrity sha512-Xm4EoEAcfXNVuxi2LQU7rjTAFXIp6+/GfcqLsfmZTdGyRMOUAJW1cG/UEdociuIfz2/lPBiz8GB+d03xhmOZtA==` 与本地 dry-run 一致；拉回 tarball 复核 36 文件、无敏感目录。
- `pi install npm:pi-web-search-lite` 在隔离 agent dir 装成（`added 2 packages`，settings.json 写入 `packages: ["npm:pi-web-search-lite"]`），只配 `TAVILY_API_KEY` 即跑通：`web_search` 2 条（provider tavily）+ `web_fetch https://example.com`（extractor tavily）。

## 9. 局限

- §5 依赖外部 key 与代理，属一次性记录；换环境后重跑 S1–S3 即可复验。`chars` 只进 `details`（不进模型上下文），模型答不出字符数属预期。
- `gh` 文案快照含平台细节（Windows 为 `spawn gh-missing-xyz ENOENT`），换平台需同步更新。
- 代理开关只在 Clash 混合端口 `127.0.0.1:12450` 上验证过 CONNECT 隧道。
- §1–§3 的报文为英文化前的中文快照，重跑时以当前英文文案为准。
