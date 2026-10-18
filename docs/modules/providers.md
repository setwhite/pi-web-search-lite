# providers/ — 搜索 provider 层

把一次查询翻译成某搜索 API 的请求与统一结果形状。**不认识 extractor 与工具层、不 import 宿主包**；出站请求一律经 `http/`。

## 文件

| 文件 | 内容 |
|---|---|
| `types.ts` | `SearchResult` / `SearchOptions` / `ProviderRuntime` / `SearchProvider` 契约；`toSearchResult` 统一映射 |
| `index.ts` | 注册表与工厂 `createSearchProvider`；`resolveProviderId` / `resolveApiKey`；`ProviderError` |
| `tavily.ts` / `brave.ts` / `exa.ts` / `firecrawl.ts` / `perplexity.ts` / `parallel.ts` / `keenable.ts` / `deepseek.ts` | 八个 provider 的请求构造与响应映射 |

## API

```ts
resolveProviderId(configProvider: ProviderId, env = process.env): ProviderId
resolveApiKey(id, apiKeys): string
createSearchProvider(id, { http, apiKey, baseUrl? }): SearchProvider   // baseUrl 覆盖根地址，供测试桩
class ProviderError extends Error  // { type: "unknown_provider" | "missing_api_key" }
```

## provider 解析与 key

- 解析优先级（first wins）：`WEB_SEARCH_PROVIDER` 环境变量 > `config.provider`，只有两层：默认值 `"tavily"` 的唯一来源是 `config/schema.ts` 的 `DEFAULT_PROVIDER`，配置校验时填进必填的 `config.provider`，本层不回落。空串、纯空白视为未提供；未知名字**直接抛错并列出全部合法值**，不会静默回退。
- key：配置层已把 `API_KEY_ENV_KEYS` 里的环境变量合并进 `config.apiKeys`（env 优先）。缺 key 时抛错，文本同时给出环境变量名与 `config.apiKeys.<id>` 字段。

## 请求形状（真实端点写在各自模块的常量里）

| provider | 请求 | 认证 | 结果来源 |
|---|---|---|---|
| tavily | `POST https://api.tavily.com/search`，body `{ query, max_results }` | `Authorization: Bearer` | `results[].title/url/content` |
| brave | `GET https://api.search.brave.com/res/v1/web/search?q&count` | `X-Subscription-Token` | `web.results[].title/url/description` |
| exa | `POST https://api.exa.ai/search`，body `{ query, numResults, contents.text.maxCharacters }` | `x-api-key` | `results[].title/url/text` |
| firecrawl | `POST https://api.firecrawl.dev/v2/search`，body `{ query, limit, sources: ["web"] }` | `Authorization: Bearer` | `data.web[].title/url/description` |
| perplexity | `POST https://api.perplexity.ai/search`，body `{ query, max_results }` | `Authorization: Bearer` | `results[].title/url/snippet` |
| parallel | `POST https://api.parallel.ai/v1/search`，body `{ mode: "fast", search_queries: [query], advanced_settings: { max_results } }` | `x-api-key` | `results[].title/url/excerpts[]`（拼成 snippet） |
| keenable | `POST https://api.keenable.ai/v1/search`，body `{ query, max_results }` | `X-API-Key` | `results[].title/url/snippet`，缺则取 `description` |
| deepseek | `POST https://api.deepseek.com/v1/tools/search`，body `{ query, count }` | `Authorization: Bearer` | `results[].title/url/summary`，缺则取 `snippet` |

统一映射：缺 `title` 用 `url` 顶替，snippet 折叠空白，缺 `url` 的条目丢弃。非 2xx / 超时由 `http/` 抛 `HttpError`，本层不吞错。

## 三处取舍

- parallel 固定 `mode: "fast"`（`PARALLEL_SEARCH_MODE`）：官方把这一档列为 agent 工具调用的推荐值，约 700ms；默认档 `advanced` 约 3s，档位与计价见官方 Search Modes。
- parallel 只发 `search_queries: [query]`，不发 `objective`：工具层的 `query` 是检索式，而 `objective` 要自包含的自然语言目标，同一串塞两处只会污染结果。
- deepseek 的 `summary`（600–800 字符，官方标注给模型读）优先于 `snippet`（UI 用短摘要）；keenable 反向，`snippet`（正文摘录）优先于 `description`（短语摘要）。
