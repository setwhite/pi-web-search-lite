# extractors/ — 提取器层

`web_fetch` 的提取器链：按 `fetch.extractors` 顺序逐个尝试，第一个产出合格内容的赢。**不依赖 providers/ 与 handlers/**，出站请求一律经 `http/`。

## 文件

| 文件 | 内容 |
|---|---|
| `types.ts` | `Extractor` / `ExtractorContext` / `ExtractedPage` 契约与 `ExtractError`（含 `attempts`） |
| `index.ts` | 注册表 `EXTRACTORS`（tavily / exa / html / firecrawl / jina / parallel / keenable / deepseek）与链式编排 `extractWithChain` |
| `tavily.ts` | `POST {base}/extract`，Bearer，body `{ urls: [url] }`；缺 key → 跳过 |
| `exa.ts` | `POST {base}/contents`，`x-api-key`，body `{ ids: [url], text.maxCharacters }`；缺 key → 跳过 |
| `firecrawl.ts` | `POST {base}/v2/scrape`，Bearer，body `{ url, formats: ["markdown"] }`；缺 key → 跳过 |
| `jina.ts` | `GET {base}/<url>`，`Accept: application/json`；**无 key 也可用**，有 key 时带 Bearer |
| `html.ts` | 本地零依赖 HTML 提取：`htmlToText` / `extractTitle` |
| `parallel.ts` | `POST {base}/v1/extract`，`x-api-key`，body `{ urls: [url], advanced_settings: { full_content: true } }`；缺 key → 跳过 |
| `keenable.ts` | `GET {base}/v1/fetch?url=<url>&live=true`，`X-API-Key`；缺 key → 跳过 |
| `deepseek.ts` | `POST {base}/v1/tools/fetch`，Bearer，body `{ url }`；缺 key → 跳过 |

## API

```ts
extractWithChain(url, order, ctx, extractors?): Promise<ExtractedPage>   // extractors 仅测试注入
EXTRACTORS: Record<ExtractorId, Extractor>
interface ExtractorContext { http; apiKeys; minChars; maxCharsPerPage; signal? }
```

## Fallback 语义（ADR-0002）

1. 该提取器需要 key 但没配 → **跳过**：不发请求、不计失败，原因记入 `attempts`。`jina` 是唯一例外（无 key 也发请求，官方 20 RPM），`html` 不需 key。
2. 抛错（非 2xx / 超时 / 二进制 / 响应缺字段）→ 记录原因，试下一个。
3. 结果长度 < `fetch.minChars` → 视为无效，记录原因，试下一个。
4. 全部失败 → 抛 `ExtractError`，错误文本逐条列出每个提取器的名字与原因（跳过、失败都列）。
5. 成功 → 内容超 `fetch.maxCharsPerPage` 截断并标记 `truncated`；`title` 缺失时用最终 URL 顶替。

> 隐私提示：默认链里的 `jina` 会把目标 URL 交给 `r.jina.ai`（匿名 20 RPM）；在意隐私就把它移出 `fetch.extractors`。

## html 提取的步骤

`html.ts` 零依赖：剥 `script/style/noscript/head/title/meta/link` → 块级标签换成换行 → 去标签 → 解实体 → 压空白；二进制内容类型（`image/*`、`application/pdf` 等）直接抛错顺延。

## 三处 provider 语义

- `parallel`：要 `advanced_settings.full_content` 才返回整页 markdown；单 URL 的失败在响应的 `errors[]` 里，取第一个抛错。v1 路径，v1beta 的顶层 `full_content` 会 422。
- `keenable`：固定 `live=true`——默认档只给索引副本，未索引的 URL 直接报错，而提取器的契约是拿到源站正文；代价是该请求按 `fetch.live` 单独计费。
- `deepseek`：整页 markdown 在 `content`，无 content 即抛错顺延。

## 已知取舍

- 六家带 key 的提取器各自手写一份 `unavailableReason`（差异只有 id），同形的还有 `extract()` 开头的 `ctx.apiKeys.<id>?.trim() ?? ""`。这是刻意保留的：文案已被各家的单测与 `test/regression/messages.test.ts` 锁住，抽成 helper 只省下 import 数、不改变行为。正确收口点在接口层——让 `Extractor` 声明所需 key（如 `requiresApiKey`），由 `extractors/index.ts` 统一算跳过原因（provider 侧的 `resolveApiKey` 就是这个样板）；待第 7 家出现时按此收口。

## 一处实现偏离

端点常量由本层自持（`TAVILY_API_BASE` / `EXA_API_BASE` / `FIRECRAWL_API_BASE` / `JINA_READER_BASE`）、key 只读 `config.apiKeys`：`providers/` 与 `extractors/` 互不依赖，且缺 key 在本层的语义是跳过而非报错（ADR-0002）。

`raw: true` 不进本链（由工具层直接返回原始 body）。
