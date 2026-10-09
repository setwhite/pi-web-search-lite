# providers/ — 搜索 provider 层

把一次查询翻译成某搜索 API 的请求与统一结果形状。**不认识 extractor 与工具层、不 import 宿主包**；出站请求一律经 `http/`。

## 文件

| 文件 | 内容 |
|---|---|
| `types.ts` | `SearchResult` / `SearchOptions` / `ProviderRuntime` / `SearchProvider` 契约；`toSearchResult` 统一映射 |
| `index.ts` | 注册表与工厂 `createSearchProvider`；`resolveProviderId` / `resolveApiKey`；`ProviderError` |
| `tavily.ts` / `brave.ts` / `exa.ts` | 三个 provider 的请求构造与响应映射 |

## API

```ts
resolveProviderId(override, configProvider, env = process.env): ProviderId
resolveApiKey(id, apiKeys): string
createSearchProvider(id, { http, apiKey, baseUrl? }): SearchProvider   // baseUrl 覆盖根地址，供测试桩
class ProviderError extends Error  // { type: "unknown_provider" | "missing_api_key" }
```

## provider 解析与 key

- 解析优先级（first wins）：`web_search` 的 `provider` 参数 > `WEB_SEARCH_PROVIDER` 环境变量 > `config.provider` > `"tavily"`；空串 / 纯空白视为未提供；未知名字**直接抛错并列出三个合法值**，不静默回落。
- key：配置层已把 `TAVILY_API_KEY` / `BRAVE_API_KEY` / `EXA_API_KEY` 合并进 `config.apiKeys`（env 优先）。缺 key 时抛错，文本同时给出环境变量名与 `config.apiKeys.<id>` 字段。

## 请求形状（真实端点写在各自模块的常量里）

| provider | 请求 | 认证 | 结果来源 |
|---|---|---|---|
| tavily | `POST https://api.tavily.com/search`，body `{ query, max_results }` | `Authorization: Bearer` | `results[].title/url/content` |
| brave | `GET https://api.search.brave.com/res/v1/web/search?q&count` | `X-Subscription-Token` | `web.results[].title/url/description` |
| exa | `POST https://api.exa.ai/search`，body `{ query, numResults, contents.text.maxCharacters }` | `x-api-key` | `results[].title/url/text` |

统一映射：缺 `title` 用 `url` 顶替，snippet 折叠空白，缺 `url` 的条目丢弃。非 2xx / 超时由 `http/` 抛 `HttpError`，本层不吞错。
