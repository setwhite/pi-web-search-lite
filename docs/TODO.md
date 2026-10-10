# pi-web-search-lite — 任务台账

规则：每条任务一次会话内可完成；新模块交付物固定为**实现 + 模块 README + 单元测试**三件套。完成后状态改 `待审`，验收通过改 `完成`，打回改 `打回`。

状态：`未开始` / `进行中` / `待审` / `完成` / `打回`

验收证据只记指针（测试文件 / `docs/VERIFICATION.md` 小节 / commit）；契约与理由分别落在模块 README 与 `docs/PLAN.md`，本文件不复述。

## 状态总表

| # | 任务 | 状态 | 交付物 | 验收证据 |
|---|---|---|---|---|
| T1 | 仓库骨架 + 配置模块 | 完成 | `config/` | `test/config.test.ts` |
| T2 | HTTP 客户端 + SSRF 守卫 | 完成 | `http/`、`ssrf/` | `test/http.test.ts`、`test/ssrf.test.ts` |
| T3 | provider 层 | 完成 | `providers/` | `test/providers/*.test.ts` |
| T4 | GitHub handler | 完成 | `handlers/` | `test/handlers/*.test.ts` |
| T5 | 提取器层 | 完成 | `extractors/` | `test/extractors/*.test.ts` |
| T6 | 工具层与结果信封 | 完成 | `tools/{search,fetch,result}.ts` | `test/tools/{search,fetch,result}.test.ts` |
| T7 | 入口注册、上下文开关与文档 | 完成 | `index.ts`、根 `README.md` | `test/index.test.ts`；VERIFICATION T7 |
| T8 | 安全与回归测试 | 完成 | `test/regression/` | `test/regression/*.test.ts`；VERIFICATION T8 |
| T9 | 工具 UI 渲染 | 完成 | `tools/render.ts` | `test/tools/render.test.ts`；VERIFICATION T9 |
| T10 | 运行时文案英文化 | 完成 | 全仓模型可见字符串 | `test/regression/messages.test.ts`；VERIFICATION T10 |
| T11 | CI（GitHub Actions） | 完成 | `.github/workflows/ci.yml` | VERIFICATION T11 |
| T12 | npm 发布 | 完成 | `package.json`、`LICENSE` | VERIFICATION T12 |
| T13 | 默认提示词精简 | 完成 | `tools/{search,fetch}.ts` | commit `f200655`；`test/index.test.ts` 的 guidance 用例 |
| T14 | 新增搜索源与提取器（firecrawl / perplexity / jina） | 完成 | `providers/{firecrawl,perplexity}.ts`、`extractors/{firecrawl,jina}.ts` | `test/providers/{firecrawl,perplexity}.test.ts`、`test/extractors/{firecrawl,jina}.test.ts` |
