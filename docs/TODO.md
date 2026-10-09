# pi-web-search-lite — 任务台账

规则：每条任务一次会话内可完成；新模块交付物固定为**实现 + 模块 README + 单元测试**三件套。完成后状态改 `待审`，验收通过改 `完成`，打回改 `打回`。

状态：`未开始` / `进行中` / `待审` / `完成` / `打回`

验收证据只记指针（测试文件 / `docs/VERIFICATION.md` 小节 / commit）；契约与理由分别落在模块 README 与 `docs/PLAN.md`，本文件不复述。

## 状态总表

| # | 任务 | 状态 | 交付物 | 验收证据 |
|---|---|---|---|---|
| T1 | 仓库骨架 + 配置模块 | 完成 | `config/` | `test/config.test.ts` |
| T2 | HTTP 客户端 + SSRF 守卫 | 完成 | `http/`、`ssrf/` | `test/http.test.ts`、`test/ssrf.test.ts` |
| T3 | provider 层（tavily / brave / exa） | 完成 | `providers/` | `test/providers/*.test.ts` |
| T4 | GitHub handler | 完成 | `handlers/` | `test/handlers/*.test.ts` |
| T5 | 提取器层 | 完成 | `extractors/` | `test/extractors/*.test.ts` |
| T6 | 工具层与结果信封 | 完成 | `tools/{search,fetch,result}.ts` | `test/tools/{search,fetch,result}.test.ts` |
| T7 | 入口注册、上下文开关与文档 | 完成 | `index.ts`、根 `README.md` | `test/index.test.ts`；VERIFICATION §1、§3 |
| T8 | 安全与回归测试 | 完成 | `test/regression/` | VERIFICATION §1–§5 |
| T9 | 工具 UI 渲染 | 完成 | `tools/render.ts` | `test/tools/render.test.ts`；VERIFICATION §6 |
| T10 | 运行时文案英文化 | 完成 | 全仓模型可见字符串 | VERIFICATION §6；`rg '\p{Han}'` 命中项全为注释 |
| T11 | CI（GitHub Actions） | 待审 | `.github/workflows/ci.yml` | VERIFICATION §7；run `37938649108` |
| T12 | npm 发布 | 待审 | `package.json`、`LICENSE` | VERIFICATION §8 |
| T13 | 默认提示词精简 | 待审 | `tools/{search,fetch}.ts` | commit `f200655`；`test/index.test.ts` guidance 用例 |

## 待验项

- **T11**：`pull_request` 触发已配置，待首个 PR 验证；其余验收已达成。
- **T12**：0.1.0 已发布，待用户复核注册表与 `pi install` 结果（原始记录见 VERIFICATION §8）。
- **T13**：默认提示词待用户复核。范围见下节。

## T13 默认提示词精简（2026-10-10）

- 范围：两个工具的 `promptSnippet` / `promptGuidelines` / `description` 全部改成英文单行；guidelines 前缀与 fetch 对 search 的跨工具引用在注册时用 `config.tools.*.name` 组装，改名不失效。
- 从提示词删除、改由代码 / 报错 / 结果文案承载的契约：provider 解析顺序与不回退、`max_results` clamp、截断落盘续读、`raw` 细节、`minChars` 与提取器失败条件、GitHub handler 与提取器链顺序。
- 保留：何时使用（训练数据之外 / 需要 URL 全文）与引用格式 `Sources:` + `[Title](URL)`。
- 证据：commit `f200655`；`test/index.test.ts` 的 guidance 用例（含改名 `ws` / `wf` 场景）；`pnpm test` 226 例 + `pnpm run typecheck` 通过。

## 偏离与决定（仍有效）

- **T5 偏离**：`extractors/` 自持端点常量，不复用 `providers/`——两层互不依赖，且缺 key 在链里的语义是跳过而非报错（`extractors/README.md`）。
- **T7 发现**：与本机 rpiv-web-tools 默认工具名冲突会让 pi EXIT=1，用 `tools.*.name` 改名绕过（根 `README.md` 排查表）。
- **T9 / T10 决定**：渲染契约（文案位置、失败判定、预览上限 5 / 15）见 `tools/README.md`，宿主 import 点见 `docs/ARCHITECTURE.md`。
- 其余选型理由与非目标集中在 `docs/PLAN.md`。
