# CHANGELOG

已发布版本的用户可见变更；更细的过程见 git log。0.x 期间破坏性变更走 minor 号，条目里标注 **BREAKING**。

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
