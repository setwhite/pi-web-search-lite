# pi-web-search-lite 术语表

本扩展特有概念的唯一命名来源；通用词（timeout、HTTP 状态码）不收。这里只说是什么；怎么做看代码与测试，取舍与坑看 `docs/modules/`。

## 搜索与抓取

**provider**:
搜索源：把一次查询翻译成某家搜索 API 请求的模块，可选 tavily / brave / exa / firecrawl / perplexity / parallel / keenable / deepseek。
_Avoid_: backend、搜索后端、搜索引擎

**提取器（extractor）**:
抓取链里一个「URL → 正文」的实现，可选 tavily / exa / firecrawl / jina / html / parallel / keenable / deepseek。
_Avoid_: 抽取器、parser、抓取器

**提取器链**:
按 `fetch.extractors` 顺序逐个尝试提取器、第一个拿到合格正文者胜出的机制。
_Avoid_: fallback 链（链是配置顺序，不是失败回退）

**handler**:
`web_fetch` 第 0 步的专用页面处理器：命中后直取正文（github，经 gh 子进程）或只改写 URL（reddit）。本层不发 HTTP、不做提取。
_Avoid_: 插件、适配器

**跳（skip）**:
提取器或 handler 因缺 key、被关掉等原因不参与本次尝试；原因是可预期的配置状态，不计失败，结果里注明后顺延。
_Avoid_: 失败（失败指尝试过但报错或正文不合格）

**透明顺延**:
handler 跳过或提取器失败时，原因写进结果 / 报错，交给下一个来源接着做——不是静默降级。
_Avoid_: 静默降级、兜底

**rewrite**:
reddit handler 的产物：只换了域名的 URL（连同原 URL 一起交给工具层）；与 github handler 直出的正文相对。
_Avoid_: 跳转、重定向（重定向是 HTTP 层行为）

## 结果与上下文

**信封（envelope）**:
发给模型的最终结果：`content`（模型读）加 `details`（TUI 与测试读）。
_Avoid_: 响应包、result（`AgentToolResult` 是宿主类型）

**三道 max 闸**:
正文从出网到进模型的三道独立上限，按来源只经过其中 1–2 道（`raw` 只过第 3 道）。逐键作用对象见根 `README.md`「三道 max 闸」。
_Avoid_: 截断链

**spill**:
信封截断时把完整文本写进临时文件（`context.spillToFile`），路径回填进结果供 `read` 续读。只在截断时发生。
_Avoid_: 落盘、缓存

**raw**:
`web_fetch` 的旁路参数：返回原始响应体，跳过 handler 与提取器链；`fetch.allowRaw` 为真时才进 schema。

## 验证

**真链路（live）**:
打真实外网与真实 key 的冒烟测试，放 `test/e2e/`，只由 `pnpm test:e2e` 拉起、永不进 CI；回答的是「上游还认不认这条请求」，形状与逻辑仍由夹具测试钉。
_Avoid_: e2e 测试、集成测试（与默认套件不是同一档）

**发布物**:
`package.json` 的 `files` 决定的那批文件；由 `test/package.test.ts` 与发布流水线的 tarball 断言守，`test/`、`docs/`、`scripts/` 不进包。
_Avoid_: 产物、artifact

## 配置面

**agent dir**:
pi 的 agent 目录：`PI_CODING_AGENT_DIR` > `~/.pi/agent`；配置在 `<agent dir>/pi-web-search-lite/config.json`。

**guidance**:
覆盖内置提示词三个字段（`description` / `promptSnippet` / `promptGuidelines`）的配置区，按工具 id 分组。

**activation**:
工具的暴露方式：`eager`（常驻上下文）或 `deferred`（交给宿主 `tool_search` 按需发现）。
_Avoid_: 懒加载、按需加载
