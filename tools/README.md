# tools/ — 工具层

`web_search` / `web_fetch` 的编排、模型可见信封与 TUI 渲染。**宿主能力（截断工具与 `ToolDefinition` / `AgentToolResult` / `Theme` 类型）的唯一 import 点是 `result.ts`**（宿主的 `ExtensionAPI` 类型只由 `index.ts` 以 `import type` 引入）；**`@earendil-works/pi-tui` 的唯一 import 点是 `render.ts`**。面向模型的文案在 `search.ts` / `fetch.ts`，面向界面的文案在 `render.ts`。

## 文件

| 文件 | 内容 |
|---|---|
| `result.ts` | `finalizeContent`（宿主截断 + spill）、`buildToolResult`（信封组装）、宿主类型的单一 import 点 |
| `render.ts` | `renderCall` / `renderResult`：调用行与结果行、折叠/展开、partial、失败回退（pi-tui 唯一 import 点） |
| `search.ts` | `executeSearch` 与 `createSearchTool`：provider 四层解析、key 检查、`max_results` clamp、结果信封 |
| `fetch.ts` | `executeFetch` 与 `createFetchTool`：SSRF 检查 → GitHub handler → 提取器链（或 raw）、来源标注 |

## API

```ts
createSearchTool(config, overrides?): ToolDefinition<SearchParameters, SearchDetails>   // T7 在 index.ts 注册
createFetchTool(config, overrides?): ToolDefinition<TSchema, FetchDetails>
executeSearch(config, params, signal, overrides?): Promise<AgentToolResult<SearchDetails>>
executeFetch(config, params, signal, overrides?): Promise<AgentToolResult<FetchDetails>>
finalizeContent(text, options): Promise<FinalizeOutcome>
renderSearchCall / renderSearchResult / renderFetchCall / renderFetchResult   // 直接挂在工具定义上
```

`overrides` 是测试 seam（`http` / `provider` / `execGh` / `extractors`），生产不传。`ToolDefinition` 的五个展示字段（`name` / `label` / `description` / `promptSnippet` / `promptGuidelines`）都在此组装：`name` 取 `config.tools.*.name`，其余可被 `config.guidance.*` 整字段覆盖；内置默认值为英文单行，guidelines 用配置的工具名组装（fetch 的规则引用 search 的实际名字）。`index.ts` 只做注册与开关。

## 信封与截断（`result.ts`）

- 上限：`config.context.maxInlineChars` / `maxInlineLines`（null = 宿主 `DEFAULT_MAX_BYTES` / `DEFAULT_MAX_LINES`），并用 `Math.min` 夹到宿主上限；`maxInlineChars` 直接作为宿主的 `maxBytes` 传入（宿主按字节截断，字段名保留 PLAN 的 chars）。
- 截断时 `content` 追加「已截断：共 N 行 / M 字节」说明；`spillToFile` 为真时写 `mkdtemp(tmpdir(), "pi-web-search-lite-")/<fileName>`（经 `withFileMutationQueue`），并把绝对路径同时放进 `content` 与 `details.fullOutputPath`，提示用 `read` 继续。
- 未截断时原样返回、不落盘。错误一律 `throw`，不在 `content` 里伪装成功。

## 两个工具的细节

| | `web_search` | `web_fetch` |
|---|---|---|
| 参数 | `query` 必填；`max_results`（clamp 1–`search.maxResultsLimit`，缺省 `search.defaultMaxResults`）；`provider` 覆盖 | `url` 必填；`raw` **仅当 `fetch.allowRaw` 为真才进 schema** |
| 顺序 | `resolveProviderId`（序号见 `providers/README.md`）→ `resolveApiKey` → provider | `assertPublicUrl` → handler → 提取器链；`raw: true` 跳过 handler 与链 |
| details | `{ provider, query, count, results, truncated, fullOutputPath? }` | `{ url, title, source, mode, chars, visibleChars, truncated, fullOutputPath?, handlerSkips }` |

- `source` 取 `"github"` / `ExtractorId` / `"raw"`；handler 命中但跳过时 `handlerSkips` 记录原因，`content` 用引用行注明「未接管」，再顺延到链（透明顺延）。
- `chars` 是提取正文的字符数（截断前），`visibleChars` 是模型实际收到的 `content` 长度（截断后，含头部与提示）；两者不等即说明发生过截断。
- `raw` 与 handler 互斥：raw 分支根本不调用 `runPageHandlers`。
- 空搜索结果仍返回成功信封（`content` 写明 `No results returned`）；缺 key / 内网 URL / 全部提取器失败都会 `throw`，错误文本给出环境变量、配置键或原因汇总。

## 渲染（`render.ts`）

数据源只有 `args` 与 `details`：不读网络、不改 details、不进模型上下文；渲染抛错时宿主回退到默认样式。

- 调用行：`Web Search "查询词"[ via provider]`（provider 只在参数显式传入时才有）、`Web Fetch <url>`。
- 结果行折叠时只给一行摘要：搜索 `✓ N results (provider)`，fetch `✓ Fetched: 标题`；`truncated` 追加 ` (truncated)`。
- `expanded` 才展开：搜索列前 5 条标题后给 `… N more`，fetch 列正文前 15 行后给 `… N more lines`（上限参考 rpiv 的 5 / 15）。
- `isPartial` 显示 `Searching…` / `Fetching…`（本扩展不调 `onUpdate`，只有宿主流式更新才会出现）。
- 失败：宿主对抛错的工具生成 `details = {}` 的结果，按形状判定后显示 `✗ + 错误首行`，展开给全文；绝不显示 ✓。
- 界面文案统一用简短英文（TUI 惯例）；错误首行原样透传。运行时文案（工具描述 / 错误 / TUI）全部英文，注释与文档保持中文。
- 只使用 `theme.fg` / `theme.bold`；组件用 pi-tui 的 `Text`（peerDependency `*`，由 pi 提供，见 pi 文档 `docs/packages.md`）。

## 测试

`test/tools/{result,search,fetch,render}.test.ts` 用 `test/tools/fixtures.ts` 的 `makeConfig` + `fakeHttp` 桩；handler 与提取器用计数 fake 断言「命中时链不被调用」「raw 时两者都不被调用」。渲染用假 `Theme`（记录 `fg` 的 color）断言文案与语义色；不打真实网络。
