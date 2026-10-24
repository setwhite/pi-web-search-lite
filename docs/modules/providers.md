# providers/ — 搜索 provider 层

把一次查询翻译成某搜索 API 的请求与统一结果形状。**不认识 extractor 与工具层、不 import 宿主包**；出站请求一律经 `http/`。

换源、缺 key 与默认值的规则见 [ADR-0001](../adr/0001-explicit-search-provider.md)；解析与工厂在 `providers/index.ts`，各家的端点常量、请求与响应映射在 `providers/<id>.ts`，形状由 `test/providers/` 钉住。本文只记代码读不出的外部取舍。

## 三处取舍

- parallel 固定 `mode: "fast"`（`PARALLEL_SEARCH_MODE`）：官方把这一档列为 agent 工具调用的推荐值，约 700ms；默认档 `advanced` 约 3s，档位与计价见官方 Search Modes。
- parallel 只发 `search_queries: [query]`，不发 `objective`：工具层的 `query` 是检索式，而 `objective` 要自包含的自然语言目标，同一串塞两处只会污染结果。
- deepseek 的 `summary`（600–800 字符，官方标注给模型读）优先于 `snippet`（UI 用短摘要）；keenable 反向，`snippet`（正文摘录）优先于 `description`（短语摘要）。
