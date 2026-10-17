# 架构决策记录（ADR）

一条一文件，编号即顺序。改动其中一条时新开一条，并在旧条注明取代关系。

| # | 决策 |
|---|---|
| [0001](0001-explicit-search-provider.md) | 搜索源用白名单 + 显式选择，不做自动 fallback |
| [0002](0002-extractor-chain-default.md) | 抓取走提取器链，默认 html → jina |
| [0003](0003-github-via-gh-cli.md) | GitHub 页面交给 gh 直接取正文 |
| [0004](0004-single-proxy-setting.md) | 代理只有一个配置点：config.proxy |
| [0005](0005-strict-config-validation.md) | 配置非法即抛错，数值越界只 clamp |
| [0006](0006-configurable-context-surface.md) | 影响上下文的开关全部可配，deferred 复用宿主 tool_search |
| [0007](0007-truncate-and-spill.md) | 结果统一截断 + 落临时文件续读；SSRF 只做静态判定 |
| [0008](0008-throw-errors-english-prompts.md) | 错误一律 throw；模型可见文案英文单行 |
| [0009](0009-reddit-host-rewrite.md) | reddit 页面只换域名到 redlib 实例 |
| [0010](0010-scope-two-tools.md) | 范围：只做 web_search 与 web_fetch 两个工具 |
