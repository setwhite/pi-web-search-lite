# pi-web-search-lite — TODO

规则：每条任务一次会话内可完成；新模块交付物固定为**实现 + 模块 README + 单元测试**三件套。完成后状态改 `待审`，验收通过改 `完成`，打回改 `打回` 并把原因写在任务下方。

状态：`未开始` / `进行中` / `待审` / `完成` / `打回`

---

## T1 仓库骨架 + 配置模块

- 状态：完成 ｜ 前置：无
- 交付物：`package.json`、`tsconfig.json`、`index.ts`（最小可加载）、`config/index.ts`、`config/README.md`、`test/config.test.ts`、`README.md`（占位）
- 验收（TDD：先红后绿）：
  - [x] 流程：先写 `test/config.test.ts` 并实测失败（红），再实现 `config/index.ts` 至全绿；脚手架文件（package.json / tsconfig 等）不适用 TDD
  - [x] `pnpm run typecheck`（`tsc --noEmit`）通过
  - [x] `pnpm test` 覆盖：缺文件时全默认值、`TAVILY_API_KEY` 优先于 `config.apiKeys.tavily`、非法字段报错文本同时含文件路径与字段路径、`timeoutMs` / `minChars` / `maxResultsLimit` 的 clamp 边界、两个工具同时 `enabled: false` 时报错
  - [x] 配置文件缺失时 `pi --extension ./index.ts -p "hi"` 不报错退出
  - [x] 故意写坏 JSON（`<agent dir>/pi-web-search-lite/config.json`）后同一命令输出含配置文件的绝对路径

## T2 HTTP 客户端 + SSRF 守卫

- 状态：完成 ｜ 前置：T1
- 交付物：`http/index.ts`、`ssrf/index.ts`、两个模块 README、`test/http.test.ts`、`test/ssrf.test.ts`
- 验收（TDD：先红后绿）：
  - [x] 流程：先写 `test/ssrf.test.ts` / `test/http.test.ts` 并实测失败（模块不存在），再实现至全绿
  - [x] `pnpm test` 通过（70 用例）；HTTP 用例（本地桩 server）：请求带 `userAgent`、`timeoutMs` 到期抛归一化超时错误、`AbortSignal` 中断、非 2xx 错误含状态码与 URL、配置 `proxy` 时经桩代理而非直连目标
  - [x] SSRF 用例：非 http(s) 拒绝；`localhost` / `127.0.0.1` / `::1` / `10.x` / `172.16-31.x` / `192.168.x` / `169.254.169.254` / `*.local` 拒绝；正常公网域名放行
  - [x] 两模块均不 import 宿主包（`rg @earendil` 为空）；`ssrf/` 不发网络请求（桩 server 命中数为 0）

## T3 provider 层（Tavily / Brave / Exa）

- 状态：完成 ｜ 前置：T2
- 交付物：`providers/{types,index,tavily,brave,exa}.ts`、`providers/README.md`、`test/providers/*.test.ts`
- 验收（TDD：先红后绿）：
  - [x] 流程：先写 `test/providers/*.test.ts` 并实测失败（模块不存在），再实现至全绿
  - [x] 每个 provider 用桩 server 断言请求形状（endpoint、方法、认证头 / body 字段）与响应 → 统一结果形状的映射
  - [x] 缺 key 时报错文本同时含环境变量名与 `config.apiKeys.<name>` 键名
  - [x] provider 解析优先级四层各一条：`provider` 参数 > `WEB_SEARCH_PROVIDER` > `config.provider` > `"tavily"`
  - [x] 未知 provider 名抛错并列出三个合法值

## T4 GitHub handler

- 状态：完成 ｜ 前置：T2（`handlers.github.*` 配置已可用）
- 交付物：`handlers/{types,index}.ts`、`handlers/github/{index,gh,render}.ts`、`handlers/README.md`、`test/handlers/*.test.ts`
- 验收（TDD：先红后绿）：
  - [x] 流程：先写 `test/handlers/*.test.ts`（含 fixtures）并实测失败（模块不存在），再实现至全绿
  - [x] URL 解析覆盖 6 类页面（仓库首页 / blob / tree / issue / pull / release）与不命中形态（gist、wiki、actions、discussions、非 github 域、带 query 与锚点；后两者忽略后仍命中）
  - [x] `gh` 不在 PATH、或 `gh auth status` 失败时 handler 返回未处理并给出原因文本；断言此时**没有发起任何 HTTP 请求**（另测真实 execFile 的 ENOENT 归一化）
  - [x] `render.ts` 对固定 JSON fixture 输出 markdown（含标题、状态、作者、正文、评论），超 `maxChars` 时截断
  - [x] 用例执行后临时目录无新增文件（不 clone、不落盘）

## T5 提取器层

- 状态：完成 ｜ 前置：T2、T3
- 交付物：`extractors/{types,index,tavily,exa,html}.ts`、`extractors/README.md`、`test/extractors/*.test.ts`
- 验收（TDD：先红后绿）：
  - [x] 流程：先写 `test/extractors/*.test.ts` 并实测失败（模块不存在），再实现至全绿
  - [x] 三条 fallback 语义各有用例：未配 key 跳过且不发请求、抛错顺延、结果长度 < `fetch.minChars` 顺延
  - [x] 全部失败时错误文本列出链中每个提取器的名字与失败原因
  - [x] `html.ts` 对固定 HTML fixture：剥离 script/style/noscript、块级标签转换行、实体解码、连续空白压缩、`<title>` 抽取
  - [x] 链中某提取器成功时，后续提取器不再被调用（桩计数为 0）
- 偏离：前置写「复用 provider 的 key 解析与端点常量」，但 ARCHITECTURE 规定 providers/ 与 extractors/ 互不依赖，且缺 key 在链里是跳过而非报错；本层自持端点常量，key 只读 `config.apiKeys`（README 已记录）

## T6 工具层与结果信封

- 状态：完成 ｜ 前置：T3、T4、T5
- 交付物：`tools/{search,fetch,result}.ts`、`tools/README.md`、`test/tools/*.test.ts`
- 验收（TDD：先红后绿）：
  - [x] 流程：先写 `test/tools/*.test.ts` 并实测失败（`Cannot find module '../../tools/...'`），再实现至全绿（20 例）
  - [x] 超过 `context.maxInlineChars` 或 `maxInlineLines` 时 `content` 含截断说明与临时文件绝对路径，`details.fullOutputPath` 与之一致
  - [x] `context.spillToFile: false` 时不写文件且 `content` 仍说明已截断
  - [x] `web_fetch` 命中 handler 时提取器链不被调用；`raw: true` 时 handler 与提取器链都不被调用（计数 fake 断言为 0）
  - [x] `web_search` 的 `max_results` 按 `search.maxResultsLimit` clamp，未传时用 `search.defaultMaxResults`
  - [x] 失败路径统一 `throw`，且错误文本包含下一步动作（去哪个文件配哪个键）
- 决定：`context.maxInlineChars` 直接作为宿主 `maxBytes` 传入（宿主按字节截断），并在 `result.ts` 用 `Math.min` 夹到宿主 `DEFAULT_MAX_BYTES` / `DEFAULT_MAX_LINES`；`raw` 是否进 schema 由 `fetch.allowRaw` 决定（README 已记录）

## T7 入口注册、上下文开关与文档

- 状态：完成 ｜ 前置：T1、T6
- 交付物：`index.ts`（完整）、仓库 `README.md`（安装 / 配置 / 代理 / GitHub 前置条件 / 排查）
- 验收（TDD：先红后绿）：
  - [x] 流程：先写 `test/index.test.ts`（假 `ExtensionAPI` + 临时 agent 目录）实测 7/9 失败，再实现至全绿（9 例）
  - [x] 假 `ExtensionAPI` 断言：`tools.*.enabled: false` 时对应 `registerTool` 未被调用；`tools.*.name` 生效
  - [x] 非法名 / 两个工具重名时入口抛出配置错误（不吞错、不静默降级）
  - [x] `activation: "eager"` 时 `exposure` 为 `direct`；`"deferred"` 时为 `deferred` + `defaultActive: false`，并在 `session_start` 把 `tool_search` 合入激活集（已在激活集时不重复调用；加载期不调用动作方法）
  - [x] 宿主不提供 `tool_search` 时退回直接激活并 `console.warn` 一行
  - [x] `guidance.*` 覆盖 `description` / `promptSnippet` / `promptGuidelines`；未配置时与默认值一致（本次给两个工具补了默认 `promptSnippet`）
  - [x] 手动（真实 `pi --extension ./index.ts`）：无代理时 `lite_web_fetch` 报 `fetch failed`；`config.proxy` 指向 127.0.0.1:12450 时同命令返回 `Example Domain`；`lite_web_search` 缺 key 时报「请设置环境变量 TAVILY_API_KEY，或在配置文件的 config.apiKeys.tavily 字段填写」
  - [ ] 未能完成：真实 API 搜索返回结果（本机无 TAVILY / BRAVE / EXA key，与 T3 一致，靠桩 server 验收）
  - [x] deferred 端到端（发现 → 激活 → 调用）已在 T8 真机验证，见 `docs/VERIFICATION.md` 第 3 节
- 偏离/发现：本机已装 rpiv-web-tools（同样注册 `web_search` / `web_fetch`），默认名会与之冲突并让 pi 以 EXIT=1 退出；手动验收用临时 `tools.*.name` 改名绕过，README 排查表已记录改法

## T8 安全与回归测试

- 状态：待审 ｜ 前置：T1–T7 全部 `完成`
- 交付物：`test/regression/` 用例、`docs/VERIFICATION.md`（手动验收清单：配置矩阵、代理开关、GitHub handler 开启/关闭、deferred 模式）
- 验收：
  - [x] `pnpm test` 全绿（22 文件 209 例）+ `pnpm run typecheck` 通过；新增回归：SSRF 黑名单 12 条逐条、错误文案快照（缺 key / 坏配置 / 坏 JSON / gh 未安装 / gh 未登录 / 全部提取器失败）
  - [x] 用桩 server 走完整链路：`web_search` 经真实 `createHttpClient` → 桩 server → 统一信封（断言 method / 路径 / Bearer / body）；`web_fetch` 经桩代理 CONNECT → html 提取器 → 截断落盘（`fullOutputPath` 文件内容 = 完整正文）
  - [x] 按 `docs/VERIFICATION.md` 手动跑通 11 项矩阵并记录实际结果与日期（配置矩阵 7 项、GitHub handler 开/关、deferred 2 项）
- 本轮修出的真实缺陷：`index.ts` 在扩展加载期调用动作方法，deferred 配置直接让 pi EXIT=1（`Extension runtime not initialized`）；改为 `pi.on("session_start", ...)` 后探测/激活，单测同步改造，真机 M10/M11 通过
- 未完成项：真实搜索 API 验收（本机无 key，与 T3 一致）
