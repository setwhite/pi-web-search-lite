# reddit 页面只换域名到 redlib 实例

`web_fetch` 第 0 步把 reddit 白名单域名（reddit.com 及其 www / old / new / np / m / i 子域、redd.it / www.redd.it）换成 `handlers.reddit.baseUrl`（默认 `https://redlib.catsarch.com`），path 与 query 原样、丢掉锚点，正文仍由全局提取器链抓；结果头写 `Rewritten from:`；媒体域与相似域名不碰，`enabled: false` 时不改写。

理由：reddit 已封直抓（直连拿回的是 `Prove your humanity` 页面），而 redlib 路由与帖子页 path 基本一一对应，换域名就够；不做 handler 专属提取链，配置面只多一个键。
