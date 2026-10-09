# extractors/ — 提取器层

`web_fetch` 的提取器链：按 `fetch.extractors` 顺序逐个尝试，第一个产出合格内容的赢。**不依赖 providers/ 与 handlers/**，出站请求一律经 `http/`。

## 文件

| 文件 | 内容 |
|---|---|
| `types.ts` | `Extractor` / `ExtractorContext` / `ExtractedPage` 契约与 `ExtractError`（含 `attempts`） |
| `index.ts` | 注册表 `EXTRACTORS`（tavily / exa / html）与链式编排 `extractWithChain` |
| `tavily.ts` | `POST {base}/extract`，Bearer，body `{ urls: [url] }`；缺席 key → 跳过 |
| `exa.ts` | `POST {base}/contents`，`x-api-key`，body `{ ids: [url], text.maxCharacters }`；缺席 key → 跳过 |
| `html.ts` | 本地零依赖 HTML 提取：`htmlToText` / `extractTitle` |

## API

```ts
extractWithChain(url, order, ctx, extractors?): Promise<ExtractedPage>   // extractors 仅测试注入
EXTRACTORS: Record<ExtractorId, Extractor>
interface ExtractorContext { http; apiKeys; minChars; maxCharsPerPage; signal? }
```

## Fallback 语义（PLAN §2.2）

1. 该提取器需要 key 但没配 → **跳过**：不发请求、不计失败，原因记入 `attempts`。
2. 抛错（非 2xx / 超时 / 二进制 / 响应缺字段）→ 记因试下一个。
3. 结果长度 < `fetch.minChars` → 视为无效，记因试下一个。
4. 全部失败 → 抛 `ExtractError`，错误文本逐条列出每个提取器名字 + 原因（跳过与失败都列出）。
5. 成功 → 内容超 `fetch.maxCharsPerPage` 截断并标记 `truncated`；`title` 缺失时用最终 URL 顶替。

## html 五步法

剥 `script/style/noscript/head/title/meta/link` → 块级标签（`br p div li tr h1-6 pre …`）转换行 → 去标签 → 解实体（命名 + `&#123;` + `&#x1F;`）→ 压空白（行内空白折叠、空行合并）。二进制内容类型（`image/*`、`application/pdf` 等）直接抛错顺延。

## 一处实现偏离

任务原计划复用 provider 的 key 解析与端点常量，但 ARCHITECTURE.md 规定 `providers/` 与 `extractors/` 互不依赖，且缺 key 在链里的语义是跳过（不抛错），与 `providers.resolveApiKey` 不同。因此本层自持端点常量（`TAVILY_API_BASE` / `EXA_API_BASE`），key 只读 `config.apiKeys`。

`raw: true` 不进本链（由工具层直接返回原始 body）。
