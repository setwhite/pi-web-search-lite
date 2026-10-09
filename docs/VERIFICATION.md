# 手动验收记录

本文件只存一次性实测（时间 / 环境 / 命令 / 结果）与复跑方式；自动化断言见 `test/`，任务状态见 `docs/TODO.md`。

## 复跑方式

- 环境：Windows + Node 22 以上 + pnpm；`gh` CLI 只在抓 GitHub 页面时用到。
- 命令：`PI_CODING_AGENT_DIR=<临时目录> pi --extension ./index.ts -p "<prompt>"`。
- 隔离 agent dir：临时目录里只放真实 `auth.json` 与最小 `settings.json`。本机装有同样注册 `web_search` / `web_fetch` 的扩展，不隔离会让 pi 直接 EXIT=1。
- 要测配置项时写 `<临时目录>/pi-web-search-lite/config.json`，不测就删掉该文件。
- 本机代理均为 Clash 混合端口 `http://127.0.0.1:12450`。

## T8 配置矩阵 / handler / deferred（2026-10-09）

结论（当时报文为中文，T10 英文化后不再逐条保留）：无 config.json 时注册两个工具；`tools.*.name` 改名生效、`enabled: false` 不注册；无 `proxy` 时抓取失败且原因指向网络，配上代理后 `example.com` 成功；坏 JSON 与 socks5 代理在启动期报错并给出字段路径；缺 key 的报错给出环境变量名与配置键；deferred 下工具不在列表、`tool_search` 可用，经它激活后可正常抓取。

同轮修掉一个真实缺陷：扩展加载期调用 `pi.getAllTools()` / `setActiveTools()` 会让 deferred 配置直接 EXIT=1（宿主报 `Extension runtime not initialized`），改为在 `session_start` 里激活。

## T7 真实 API 冒烟（2026-10-09）

tavily / exa key 经环境变量注入、未落盘：`web_search` 默认 provider 与 `provider: "exa"` 均返回真实结果；`web_fetch https://pi.dev/docs/latest` 走 tavily 提取器成功。

## T9 / T10 TUI 与英文化（2026-10-09）

ConPTY 实机捕获复核：调用行、折叠 / 展开、失败态、截断标记与语义色全部命中。`-p` 真机报文为英文信封，如 `Extracted by: extractor exa`、`web_search: 2 results (provider: tavily, max_results: 2)`。

## T11 CI（2026-10-09 起）

main 推送触发三个 job（ubuntu Node 22 / 24、windows Node 22）全绿，全程不打真实网络。`pull_request` 触发待首个 PR。

## T12 npm 发布（2026-10-09 起）

- 0.1.0（手动 `pnpm publish`）：`npm pack` 36 文件，`test/`、`docs/` 等不入包；解包后 pi 冒烟通过；注册表侧 shasum / integrity 与本地一致。
- 0.2.0 起由 main 推送自动发布（`.github/workflows/npm-publish.yml`，OIDC 可信发布），0.2.0 与 0.3.0 均发布成功。

## 局限

- 代理只验过 Clash 混合端口的 CONNECT 隧道。
- `gh` 相关文案含平台细节（Windows 报 `spawn gh-... ENOENT`），换平台要重跑。
- 默认提取链里的 `jina` 会把目标 URL 交给 `r.jina.ai`（匿名 20 RPM）；在意隐私就改 `fetch.extractors`。
