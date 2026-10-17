# 范围：只做 web_search 与 web_fetch 两个工具

扩展只提供这两个工具与它们的配置面；不做 curator / 摘要模型调用 / answer 模式，不做斜杠命令与 TUI picker，不提供 `outputSchema` / `structuredContent`，不做 MCP server 与 core/host 分层。recency / 域名过滤参数、多 provider 并发、GitHub 整仓浏览（clone + 磁盘缓存 + tree 展开）暂不做，出现真实需求再单独立项。

理由：轻量是本项目相对 pi-web-access 与 rpiv-web-tools 的立身点；上述能力都要新增一层生命周期或状态，收益没到非做不可。
