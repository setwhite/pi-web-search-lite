# CHANGELOG

已发布版本的用户可见变更；更细的过程见 git log。0.x 期间破坏性变更走 minor 号，条目里标注 **BREAKING**。

## 0.8.3 — 2026-10-22

- 升级 `undici` 8.10.2 → 8.12.3：修掉重复 `Content-Encoding` 头导致的解压失败（8.11.0），抓取拿到的正文不再可能解成乱码
- 开发：新增 `test/undici-surface.test.ts` 钉住四条隐式契约（`badPortsSet` 的内部路径、http 目标经代理走 absolute-form 不建隧道、响应自动解压、错误 cause 链带底层 code）；undici 升级流程写进 `docs/modules/http.md` 的「依赖升级」
- 开发：`files` 与依赖方向不再靠 review —— `test/package.test.ts` 断言发布物（新增顶层模块漏写目录即红），`pnpm check:imports` 执行 `docs/ARCHITECTURE.md` §2 的边与四处「单一出口」；发布流水线在 publish 前再对真实 tarball 断言一遍
- 开发：新增 `pnpm test:e2e`（真链路冒烟：8 家 provider 按 key 跳过 + 一个公开页抓取），不进 CI；`pnpm test` 只跑夹具
- 开发：CI 显式 `pnpm install --frozen-lockfile`（不再依赖 action 的隐式安装）、`biome check --error-on-warnings`、`timeout-minutes: 10`、action 按 commit SHA 固定；新增每日 `pnpm audit --prod` 工作流；新增 `.githooks/pre-commit`（`git config core.hooksPath .githooks` 启用）
- 文档：`docs/modules/config.md` 删掉默认值列，默认值唯一来源改为 `schema.ts` 常量 + 根 README「完整示例」（此前三处同源、无人对账）

## 0.8.2 — 2026-10-21

- 无运行时变更（与 0.8.1 相同）：新增 `.gitattributes`（`* text=auto eol=lf`）把仓库与工作区的行尾固定成 LF，CI 恢复 Windows runner——此前为躲 CRLF 与 biome `lineEnding lf` 的冲突只跑 Linux

## 0.8.1 — 2026-10-18

- 无运行时变更（与 0.8.0 相同）：CI 只跑 Linux——Windows runner 的 `core.autocrlf=true` 会让 checkout 出来是 CRLF，与 biome 的 LF 默认冲突，lint 必红；README 中英两版补「发版」一行；模块文档把代理转发形态改成实测口径（`http:` 目标走 absolute-form，只有 `https:` 目标才建 CONNECT 隧道）

## 0.8.0 — 2026-10-18

- 出站请求失败的错误文案带上底层原因（`connect ECONNREFUSED …`、`getaddrinfo ENOTFOUND …`、`bad port`）：此前模型只能看到 undici 的 `fetch failed`，无从判断该换域名还是重试
- 跨域重定向摘掉的认证头从 `authorization` 扩到整个头名族（`x-api-key`、`x-subscription-token` 等以 `token` / `api-key` / `api_key` / `apikey` 结尾的头名）：此前 exa / parallel / keenable 的 key 会随 30x 转发到新域
- GitHub release 链接的 tag 与 blob / tree 的 ref 走同一套校验，gh 参数用 `--` 分界：`/o/r/releases/tag/--repo` 不再被当成开关，含控制字符的 tag 落到提取器链，不再把 Node 的 `must be a string without null bytes` 透给模型
- 开发：新增 `pnpm lint`（biome 的 lint + 格式闸），CI 与发布流水线跑同一条命令

## 0.7.0 — 2026-10-18

- 新增 parallel / keenable / deepseek 三家：既是搜索源（`provider`）也是提取器（`fetch.extractors`），key 走 `PARALLEL_API_KEY` / `KEENABLE_API_KEY` / `DEEPSEEK_API_KEY` 或 `config.apiKeys.*`
- README 的最小可用配置补上 `provider`：此前只演示 tavily 的 key，换源时看不出来要改哪里

## 0.6.1 — 2026-10-18

- 无功能变更（运行时与 0.6.0 相同）：文档重构——模块文档移入 `docs/modules/`（npm 包内不再含这 7 份 README），决策拆成 `docs/adr/`，新增本文件与 `docs/GLOSSARY.md`

## 0.6.0 — 2026-10-11

- **BREAKING**：`web_search` 移除 per-call `provider` 参数，换源只走 `WEB_SEARCH_PROVIDER` / `config.provider`（ADR-0001）
- `web_fetch` 折叠行标注最终提取来源，如 `✓ Fetched: 标题 (exa)`

## 0.5.0 — 2026-10-11

- 新增 reddit handler：默认把 reddit 域名换成 redlib 实例再交给提取器链（ADR-0009）

## 0.4.0 — 2026-10-10

- 无功能变更：文档精简，README 加封面图

## 0.3.0 — 2026-10-10

- 新增 firecrawl / perplexity 搜索源与 firecrawl / jina 提取器

## 0.2.0 — 2026-10-10

- `fetch.allowRaw` 默认关闭（`raw` 参数不进 schema）；默认提取链改为 `html` → `jina`；`handlers.github.timeoutMs` 改为 30s，与 HTTP 超时一致
- 新增英文 README；新增 npm 发布工作流（OIDC 可信发布）

## 0.1.0 — 2026-10-09

- 首个发布：`config/`（单 JSON + 环境变量 key）、`http/`（代理 / 超时 / 重定向）、`ssrf/`、`providers/`（tavily / brave / exa）、`handlers/`（GitHub）、`extractors/`（tavily / exa / html）、`tools/` 与结果信封、入口注册、TUI 渲染、CI
