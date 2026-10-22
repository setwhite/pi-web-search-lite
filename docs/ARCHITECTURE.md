# pi-web-search-lite — ARCHITECTURE

模块职责与对外契约边界。模块内部的签名、字段、异常由 `docs/modules/<模块>.md` 负责，本文不复述。

## 1. 模块

| 模块 | 职责 | 契约边界 | 模块文档 |
|---|---|---|---|
| `index.ts` | 读配置，按 `tools.*` / `activation` / `guidance.*` 注册两个工具；deferred 时在 `session_start` 激活内置 `tool_search`（宿主没有就激活自身工具并 `console.warn`） | 仅扩展入口：默认导出工厂函数；不导出可复用 API | — |
| `config/` | 加载、校验、clamp 配置文件；校验 provider 取值、合并 key 来源（env 优先） | `ResolvedConfig` 类型 + 解析函数 + 配置路径；不碰网络 | [config.md](modules/config.md) |
| `http/` | 扩展自身出站 HTTP 的唯一出口：代理、超时、UA、`AbortSignal`、错误归一化 | `fetchText` / `fetchJson` 一族；不认 provider 语义 | [http.md](modules/http.md) |
| `ssrf/` | 抓取前的静态 URL 判定（协议、主机名、字面量 IP；不做端口白名单） | `assertPublicUrl` + 回环判定；不解析 DNS、不发请求 | [ssrf.md](modules/ssrf.md) |
| `providers/{types,index,tavily,brave,exa,firecrawl,perplexity,parallel,keenable,deepseek}.ts` | 把一次查询翻译成某搜索 API 的请求与统一结果形状 | `SearchProvider` 接口 + 注册表 + 工厂；不认识提取器与工具层 | [providers.md](modules/providers.md) |
| `handlers/{types,index}.ts`、`handlers/github/{index,gh,render}.ts`、`handlers/reddit/index.ts` | 识别专用页面 URL：github 产出已清洗正文，reddit 只换域名后交给链；不命中返回 `null`，跳过返回 `skipped` | `PageHandler` 接口 + 注册表；github 子目录自管 `gh` 子进程 | [handlers.md](modules/handlers.md) |
| `extractors/{types,index,tavily,exa,firecrawl,jina,html,parallel,keenable,deepseek}.ts` | 按配置顺序尝试多个正文提取器，失败时汇总原因 | `Extractor` 接口 + 链式执行器；不关心 URL 是普通页还是专用页 | [extractors.md](modules/extractors.md) |
| `tools/{search,fetch,result,render}.ts` | 编排以上模块，产出模型可读的 `content` 与渲染用 `details`；`render.ts` 负责 TUI 调用行/结果行 | 两个工具定义对象；模型文案在 `search`/`fetch`，界面文案在 `render`；`result.ts` 是宿主能力的唯一 import 点 | [tools.md](modules/tools.md) |

## 2. 依赖方向

```
index.ts
  ├─→ config/index.ts（不依赖任何业务模块）
  ├─→ tools/search.ts ─→ providers/ ─┐
  └─→ tools/fetch.ts ──→ extractors/ ─┴─→ http/index.ts ─→ ssrf/index.ts
                       ├─→ handlers/（gh 子进程，不走 http/）
                       └─→ ssrf/index.ts（入口 URL 校验）
tools/{search,fetch}.ts ─→ tools/result.ts（宿主截断工具） / tools/render.ts（pi-tui）
```

补充边（主图未画）：

- 值边：`tools/{search,fetch}.ts → tools/render.ts`（把 `renderCall` / `renderResult` 挂到工具定义上，渲染实现在 `render.ts`）。
- type-only 边（`import type`，运行时无环，不参与代码分层）：`index.ts ⇢ 宿主 ExtensionAPI`；`tools/render.ts ⇢ tools/{search,fetch}.ts`（复用 `SearchDetails` / `SearchParams`、`FetchDetails` / `FetchParams` 类型）。

规则（新代码按此判断放哪）：

- 只能沿图中箭头依赖，禁止反向 import；`config/` 不 import 业务模块，`ssrf/` 不依赖仓库内其它模块，`http/` 只依赖仓库内的 `ssrf/`。
- `providers/` / `extractors/` / `handlers/` 三者互不依赖；需要组合时由 `tools/` 编排。
- 宿主包 `@earendil-works/pi-coding-agent` 在生产代码里只在两处出现：`index.ts` 的 `import type { ExtensionAPI }`（扩展入口签名）与 `tools/result.ts`（截断工具与 `AgentToolResult` / `ToolDefinition` / `Theme` 类型）；`@earendil-works/pi-tui` 只在 `tools/render.ts`；其余模块不依赖宿主 API，便于单测。
- 工具描述与结果信封只由 `tools/` 组装；下层只产出结构化错误与原因片段（handler 的 skip reason、extractor 的链失败汇总、provider 的缺 key 文案），模型可见的最终文本由工具层决定。界面文案只出现在 `tools/render.ts`。两者统一用英文，注释与文档用中文。
- 能力边界与「不做什么」见 `docs/adr/`；新增能力不得改动上述依赖方向，必须改动则先更新本文件。
- 上述边与「单一出口」由 `scripts/check-imports.mjs` 执行（`pnpm check:imports`）：改这张图就同步改脚本里的 `EDGES` / `SINGLE_IMPORT`，两边不一致时 CI 红。

## 3. 目录与测试约定

- 模块以目录为单位：单文件模块用 `<name>/index.ts`，多文件模块在目录内平铺（如 `providers/tavily.ts`）。
- 模块文档统一放 `docs/modules/`，与模块同名（`config/` → `docs/modules/config.md`）；改接口或语义时同 PR 更新。术语见 `docs/GLOSSARY.md`。
- 测试统一放仓库根 `test/`，按被测模块建子目录（如 `test/providers/tavily.test.ts`）；跨模块回归放 `test/regression/`，共享夹具用 `fixtures.ts` / `stub.ts`。测试不进 npm 发布产物。测试标题与夹具可用中文（不进 pi），断言运行时文案时必须与源码英文一致。
- 需要 key 与外网的真链路冒烟放 `test/e2e/`，只由 `pnpm test:e2e` 拉起（`vitest.config.ts` 把它排除在 `pnpm test` 之外），永不进 CI：夹具钉形状，e2e 只回答「上游还认不认这条请求」。
- 根 README 的封面图放 `assets/`，同样不进 npm 发布产物，所以 README 里用 GitHub raw 绝对地址引用。
- 仓库级守卫是 `scripts/` 下的零依赖 node 脚本（现有：`check-imports.mjs`）；发布物由 `test/package.test.ts` 与发布流水线的 tarball 断言守。
- 提交前闸是 `.githooks/pre-commit`（跑上述四条，`git config core.hooksPath .githooks` 启用一次）；它与 CI 跑同一批命令，不另立规则。
- 收工 QA 固定四条：`pnpm lint`、`pnpm check:imports`、`pnpm test`、`pnpm typecheck`（与 CI 同款，见根 README「开发」）；发版前另跑 `pnpm test:e2e`。
- 手动验收用隔离 agent 目录：`PI_CODING_AGENT_DIR=<临时目录> pi --extension ./index.ts -p "<prompt>"`；临时目录只放真实 `auth.json` 与最小 `settings.json`，避免与本机同名工具冲突。

## 4. 文档职责（防止重复）

| 文件 | 只写 | 不写 |
|---|---|---|
| 根 `README.md` / `README.en.md`（中英镜像） | 安装、配置、功能、设计目标、环境要求、参考项目、文档索引、开发 | 选型理由、模块签名 |
| `CHANGELOG.md` | 各发布版本的用户可见变更 | 契约与理由 |
| `docs/TODO.md` | 任务台账：规则、状态、验收证据 | 契约与理由 |
| `docs/adr/`（一条一文件） | 背景、决定了什么、为什么、不做什么 | 字段表、契约细节 |
| `docs/ARCHITECTURE.md` | 模块划分、依赖方向、目录 / 测试 / 文档约定 | 模块内部签名与字段 |
| `docs/GLOSSARY.md` | 本扩展特有术语的唯一命名来源 | 实现细节 |
| `docs/modules/<模块>.md` | 该模块的 API、契约与取舍 | 其它模块的内容 |

内容归属冲突时以本表裁决；跨文档只允许指针，不允许复述内容。
