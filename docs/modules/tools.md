# tools/ — 工具层

`web_search` / `web_fetch` 的编排、模型可见信封与 TUI 渲染。宿主能力的 import 约束见 `docs/ARCHITECTURE.md` §2；两个工具的签名、信封字段、渲染文案与截断行为都在源码里，由 `test/tools/` 钉住，本文不复述。

## 不变量

- 所有结果都经 `finalizeContent`（宿主截断 + `spillToFile`）；错误一律 `throw`，不在 `content` 里伪装成功（[ADR-0008](../adr/0008-throw-errors-english-prompts.md)）。
- `raw` 分支在 handler 之前，不调用 `runPageHandlers`；`fetch.allowRaw` 为假时，即使绕过 schema 传 `raw: true` 也抛错。
- handler 只改写 URL 时（reddit → redlib），改写后的 URL 必须重跑 `assertPublicUrl` 才能进链。
- `details` 只给 TUI 与测试，不进模型上下文。

## 指针

- 截断、spill 的文件名与提示格式：`tools/result.ts`、`test/tools/result.test.ts`。
- 结果行与失败回退：`tools/render.ts`、`test/tools/render.test.ts`。
- 两个工具的 schema、`raw` 开关与文案：`tools/search.ts`、`tools/fetch.ts`、`test/tools/{search,fetch}.test.ts`。
