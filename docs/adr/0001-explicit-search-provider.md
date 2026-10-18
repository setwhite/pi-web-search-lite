# 搜索源用白名单 + 显式选择，不做自动 fallback

一次搜索只走选中的 provider：`WEB_SEARCH_PROVIDER` > `config.provider`（缺省即默认 `tavily`，由配置层填进 `config.provider`，解析只有两层）。名字不在白名单或缺 key 直接抛错，不静默换源；工具 schema 里没有 per-call `provider` 参数（0.6.0 起移除）。

理由：自动 fallback 链（auto / all / routing）是参考实现 pi-web-access 复杂度的主要来源，还会让失败原因不可归因；显式选择让「这次为什么没用某个源」只有一个答案，schema 也不随 provider 数量膨胀。

不做的：免 key 搜索源（DDG HTML、公共 SearXNG 脆弱且可能违反 ToS）、多 provider 并发搜索、per-call 换源参数。契约见 [../modules/providers.md](../modules/providers.md)。
