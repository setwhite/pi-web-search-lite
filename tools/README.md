# tools/ — 工具层

`web_search` / `web_fetch` 的编排与模型可见信封。**唯一允许 import 宿主包的工具层文件是 `result.ts`**（截断工具与 `ToolDefinition` / `AgentToolResult` 类型），也是唯一拼装面向模型文案的地方。

## 文件

| 文件 | 内容 |
|---|---|
| `result.ts` | `finalizeContent`（宿主截断 + spill）、`buildToolResult`（信封组装）、宿主类型的单一 import 点 |
| `search.ts` | `executeSearch` 与 `createSearchTool`：provider 四层解析、key 检查、`max_results` clamp、结果信封 |
| `fetch.ts` | `executeFetch` 与 `createFetchTool`：SSRF 检查 → GitHub handler → 提取器链（或 raw）、来源标注 |

## API

```ts
createSearchTool(config, overrides?): ToolDefinition      // T7 在 index.ts 注册
createFetchTool(config, overrides?): ToolDefinition
executeSearch(config, params, signal, overrides?): Promise<AgentToolResult<SearchDetails>>
executeFetch(config, params, signal, overrides?): Promise<AgentToolResult<FetchDetails>>
finalizeContent(text, options): Promise<FinalizeOutcome>
```

`overrides` 是测试 seam（`http` / `provider` / `execGh` / `extractors`），生产不传。`ToolDefinition` 的 name/label/description 在此组装（`config.tools.*.name`、`config.guidance.*` 覆盖），T7 只做注册与开关。

## 信封与截断（`result.ts`）

- 上限：`config.context.maxInlineChars` / `maxInlineLines`（null = 宿主 `DEFAULT_MAX_BYTES` / `DEFAULT_MAX_LINES`），并用 `Math.min` 夹到宿主上限；`maxInlineChars` 直接作为宿主的 `maxBytes` 传入（宿主按字节截断，字段名保留 PLAN 的 chars）。
- 截断时 `content` 追加「已截断：共 N 行 / M 字节」说明；`spillToFile` 为真时写 `mkdtemp(tmpdir(), "pi-web-search-lite-")/<fileName>`（经 `withFileMutationQueue`），并把绝对路径同时放进 `content` 与 `details.fullOutputPath`，提示用 `read` 继续。
- 未截断时原样返回、不落盘。错误一律 `throw`，不在 `content` 里伪装成功。

## 两个工具的细节

| | `web_search` | `web_fetch` |
|---|---|---|
| 参数 | `query` 必填；`max_results`（clamp 1–`search.maxResultsLimit`，缺省 `search.defaultMaxResults`）；`provider` 覆盖 | `url` 必填；`raw` **仅当 `fetch.allowRaw` 为真才进 schema** |
| 顺序 | `resolveProviderId`（参数 > env > config > tavily）→ `resolveApiKey` → provider | `assertPublicUrl` → handler → 提取器链；`raw: true` 跳过 handler 与链 |
| details | `{ provider, query, count, results, truncated, fullOutputPath? }` | `{ url, title, source, mode, chars, visibleChars, truncated, fullOutputPath?, handlerSkips }` |

- `source` 取 `"github"` / `ExtractorId` / `"raw"`；handler 命中但跳过时 `handlerSkips` 记录原因，`content` 用引用行注明「未接管」，再顺延到链（透明顺延）。
- `chars` 是提取正文的字符数（截断前），`visibleChars` 是模型实际收到的 `content` 长度（截断后，含头部与提示）；两者不等即说明发生过截断。
- `raw` 与 handler 互斥：raw 分支根本不调用 `runPageHandlers`。
- 空搜索结果仍返回成功信封（`content` 写明「未返回结果」）；缺 key / 内网 URL / 全部提取器失败都会 `throw`，错误文本给出环境变量、配置键或原因汇总。

## 测试

`test/tools/{result,search,fetch}.test.ts`（20 例）用 `test/tools/fixtures.ts` 的 `makeConfig` + `fakeHttp` 桩；handler 与提取器用计数 fake 断言「命中时链不被调用」「raw 时两者都不被调用」。不打真实网络。
