# pi-web-search-lite — 任务台账

按开发顺序排列；状态只随用户确认变更。规则：

1. 领取：取第一条 `- [ ]` 且「前置」全部完成的原子任务；任务目标或接口契约不明确时先提问，不猜测。
2. 实现：一次只推进一步（先写失败测试 Red，再补最少实现 Green）；遇 Bug 先加 Log 或查堆栈验证假设；同一错误连续失败 3 次停机汇报。
3. 交付：新模块固定为**实现 + 模块 README + 单元测试**三件套；收工跑 `pnpm test` 与 `pnpm typecheck`（见 `docs/ARCHITECTURE.md` §3）。
4. 证据：只记可复跑的指针（测试文件 / 命令输出 / commit），且必须是当前会话产生；实现会话不改状态，挂起等用户 Review。
5. 审计：在未参与实现的会话中进行，只读不改仓库文件，证据只认该会话的运行输出。
6. 边界：契约与理由分别落在模块 README 与 `docs/PLAN.md`，本文件不复述。

状态：`- [ ]` = 未完成（用户确认的中间态在行尾标注 `进行中` / `待审` / `打回`），`- [x]` = 已确认完成。

## 任务

- [x] T1 仓库骨架 + 配置模块
  - 交付物：`config/`（`schema.ts` / `validate.ts` / `readers.ts` / `index.ts` + README）
  - 验收：`loadConfig` 按 `PI_CODING_AGENT_DIR` 推导配置路径；缺文件走全默认值；坏 JSON / 非法字段抛错并带绝对路径与字段路径；越界值按 `RANGES` clamp；环境变量 key 优先于文件。
  - 验收证据：`test/config.test.ts`
  - 前置：无

- [x] T2 HTTP 客户端 + SSRF 守卫
  - 交付物：`http/`、`ssrf/`
  - 验收：出站只经 `http/`；代理仅取 `config.proxy`，本机目标绕过；超时 / abort 归一化；重定向逐跳复查 SSRF；UA 不可被调用方覆盖；静态黑名单覆盖协议 / 回环 / 私网 / link-local。
  - 验收证据：`test/http.test.ts`、`test/ssrf.test.ts`
  - 前置：T1

- [x] T3 provider 层
  - 交付物：`providers/`
  - 验收：五个 provider 的请求形状与统一映射（缺 title 用 url、缺 url 丢弃）；解析优先级 `参数 > WEB_SEARCH_PROVIDER > config > tavily`；缺 key / 未知名字抛错并列出环境变量、配置键或合法值。
  - 验收证据：`test/providers/*.test.ts`
  - 前置：T2

- [x] T4 GitHub handler
  - 交付物：`handlers/`（含 `github/` 子目录）
  - 验收：6 类 URL 形态命中后产出清洗 markdown；gh 未装 / 未登录 / 命令失败返回 `skipped` 与原因；分支名含 `/` 等已知局限顺延到提取器链。
  - 验收证据：`test/handlers/*.test.ts`
  - 前置：T1

- [x] T5 提取器层
  - 交付物：`extractors/`
  - 验收：按序尝试、第一个合格者胜出；缺 key 跳过、失败 / 低于 `minChars` 顺延；全败抛错并逐行给出每个提取器原因；超 `maxCharsPerPage` 截断标记；`html` 零依赖提取。
  - 验收证据：`test/extractors/*.test.ts`
  - 前置：T2

- [x] T6 工具层与结果信封
  - 交付物：`tools/{search,fetch,result}.ts`
  - 验收：两个工具定义与参数 clamp；`details` 形状与透明顺延（`handlerSkips`）；超限截断 + spill 临时文件、`content` 给出可 `read` 路径；错误一律 throw。
  - 验收证据：`test/tools/{search,fetch,result}.test.ts`
  - 前置：T3、T4、T5

- [x] T7 入口注册、上下文开关与文档
  - 交付物：`index.ts`、根 `README.md`
  - 验收：`tools.*.enabled/name` 与 `guidance.*` 生效；`activation: deferred` 在 `session_start` 激活 `tool_search`（宿主缺失时退化并警告）；根 README 含安装、配置与文档索引。
  - 验收证据：`test/index.test.ts`
  - 前置：T6

- [x] T8 安全与回归测试
  - 交付物：`test/regression/`
  - 验收：真实 HTTP 客户端经桩代理打通搜索与抓取全链路；SSRF 入口黑名单与公网放行；错误文案快照（缺 key / 坏配置 / gh 缺失 / 提取器全败）。
  - 验收证据：`test/regression/*.test.ts`
  - 前置：T7

- [x] T9 工具 UI 渲染
  - 交付物：`tools/render.ts`
  - 验收：调用行 / 折叠摘要 / 展开 / partial / 失败态 / 截断标记与语义色齐全；渲染只读 `args` + `details`，不进模型上下文。
  - 验收证据：`test/tools/render.test.ts`
  - 前置：T6

- [x] T10 运行时文案英文化
  - 交付物：全仓模型可见字符串
  - 验收：工具描述 / 错误 / TUI 文案全英文；注释与文档保持中文。
  - 验收证据：`test/regression/messages.test.ts`
  - 前置：T9

- [x] T11 CI（GitHub Actions）
  - 交付物：`.github/workflows/ci.yml`
  - 验收：ubuntu Node 22 / 24、windows Node 22 三 job 跑 `pnpm typecheck` + `pnpm test` 全绿；全程不打真实网络；`pull_request` 同样触发。
  - 验收证据：`.github/workflows/ci.yml`；commit `591ab1c`
  - 前置：T10

- [x] T12 npm 发布
  - 交付物：`package.json`、`LICENSE`、`.github/workflows/npm-publish.yml`
  - 验收：`npm pack` 只含发布文件（`test/`、`docs/`、`assets/` 不入包）；安装后 pi 冒烟通过；main 变更版本经 OIDC 自动发布，版本已存在时幂等跳过。
  - 验收证据：`.github/workflows/npm-publish.yml`；commit `0277a7a`；0.2.0 自动发布 commit `d68265c`
  - 前置：T11

- [x] T13 默认提示词精简
  - 交付物：`tools/{search,fetch}.ts`
  - 验收：默认提示词为英文单行；guidance 默认值随 `tools.*.name` 改名联动。
  - 验收证据：commit `f200655`；`test/index.test.ts` guidance 用例
  - 前置：T7

- [x] T14 新增搜索源与提取器（firecrawl / perplexity / jina）
  - 交付物：`providers/{firecrawl,perplexity}.ts`、`extractors/{firecrawl,jina}.ts`
  - 验收：两个 provider 与两个提取器接入注册表与配置枚举；`jina` 无 key 可用（有 key 走 Bearer）；对应 README 同步。
  - 验收证据：`test/providers/{firecrawl,perplexity}.test.ts`、`test/extractors/{firecrawl,jina}.test.ts`、`test/config.test.ts`；commit `1f8d6d1`
  - 前置：T3、T5

## 后续候选

Phase 2 候选清单见 `docs/PLAN.md` §4；确认启动后再按同一格式追加任务卡。
