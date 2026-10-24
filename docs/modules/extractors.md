# extractors/ — 提取器层

`web_fetch` 的提取器链。链的顺序、跳过 / 顺延 / 全部失败的汇总语义见 [ADR-0002](../adr/0002-extractor-chain-default.md)，实现与断言在 `extractors/index.ts`、`test/extractors/index.test.ts`。**不依赖 providers/ 与 handlers/**，出站请求一律经 `http/`。

## 取舍与坑

- 隐私：默认链里的 `jina` 会把目标 URL 交给 `r.jina.ai`（匿名 20 RPM）；在意隐私就把它移出 `fetch.extractors`。
- 端点常量由本层自持（`*_API_BASE`）、key 只读 `config.apiKeys`：`providers/` 与 `extractors/` 互不依赖，且缺 key 在本层的语义是跳过而非报错（ADR-0002）。
- `parallel`：要 `advanced_settings.full_content` 才返回整页 markdown；单 URL 的失败在响应的 `errors[]` 里，取第一个抛错。v1 路径，v1beta 的顶层 `full_content` 会 422。
- `keenable`：固定 `live=true`——默认档只给索引副本，未索引的 URL 直接报错，而提取器的契约是拿到源站正文；代价是该请求按 `fetch.live` 这个 SKU 单独计费。
- `deepseek`：整页 markdown 在 `content`，无 content 即抛错顺延。
- 六家必须带 key 的提取器各自手写一份 `unavailableReason`（差异只有 id），同形的还有 `extract()` 开头的 `ctx.apiKeys.<id>?.trim() ?? ""`。这是刻意保留的：文案已被各家的单测与 `test/regression/messages.test.ts` 锁住，抽成 helper 只省下 import 数、不改变行为。正确收口点在接口层——让 `Extractor` 声明所需 key（如 `requiresApiKey`），由 `extractors/index.ts` 统一算跳过原因（provider 侧的 `resolveApiKey` 就是这个样板）；待再出现第 7 家需要 key 的提取器时按此收口。
