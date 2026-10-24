# 结果统一截断 + 落临时文件续读；SSRF 只做静态判定

两个工具的产出超 `context.maxInlineChars` / `maxInlineLines` 就截断；`context.spillToFile` 为真时把完整文本写到临时目录，路径同时进 `content` 与 `details` 供 `read` 续读。SSRF 守卫只做协议、主机名与字面量 IP 的静态判定（重定向逐跳复查），不解析 DNS。

理由：截断 + 临时文件已覆盖「结果太长再读全文」的需求，不必引入结果持久化与分页 API；DNS 重绑定检测成本高、收益低，代价是主机名解析到私网的场景放行。

不做的：responseId / `get_search_content` 式分页、结果持久化、DNS 解析与 rebinding 检测、PDF / 图片 / YouTube 等按内容类型的专用抓取路径。契约见 `ssrf/index.ts`、`tools/result.ts` 与对应测试。
