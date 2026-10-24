# handlers/ — 专用页面 handler 层

`web_fetch` 的第 0 步：命中后要么直接产出正文（github 调 `gh`），要么只把 URL 换个域名（reddit 换 redlib）再交给提取器链；命中但跳过（未装 gh / 未登录 / 命令失败 / handler 被关掉）→ 返回 `skipped` 和原因，由工具层在结果里注明后顺延（透明顺延，不是静默降级）。不 clone、不落盘、不直接发 HTTP。

支持的 URL 形态、gh 命令计划与字段回退、改写与跳过的规则都在源码里；URL 解析由 `test/handlers/github-url.test.ts` 钉住。

## 已知 URL 局限（MVP 有意不处理）

- 分支名含 `/`：`/O/R/blob/feat/x/file.ts` 会被解析成 `ref=feat`、`path=x/file.ts`，gh 请求的其实是错误路径；请求失败后返回 `skipped` 顺延到提取器链。`tree` 同理。
- `/O/R/releases/latest`：只支持 `/releases/tag/<tag>`，`latest` 不命中，直接走提取器链。

## Reddit：只换域名

命中白名单就把域名换成 `handlers.reddit.baseUrl`（默认 `https://redlib.catsarch.com`，可带子路径；baseUrl 自带的路径前缀保留），正文仍由全局 `fetch.extractors` 抓，结果头多一行 `Rewritten from: <原 URL>`。帖子页 `/r/<sub>/comments/<id>/<slug>/` 与 redlib 路由一一对应，换个域名就能拿到正文。

- 媒体域 `i.redd.it` / `v.redd.it` / `preview.redd.it` 不在白名单，不会被改写（白名单里的 `i.reddit.com` 是站点路由，不是媒体域）。
- 不做 handler 专属提取链：要绕实例的反爬（如 Anubis 挑战页），改全局 `fetch.extractors` 或用别的实例；挑战页是 HTTP 200 且字数够 `minChars`，会被当成成功。
- redlib 没有的路由（`/comments/<id>/comment/<cid>`、`/gallery/<id>`）只回一句 `Nothing here`，字数不够 `minChars`，由链顺延并报错。

## 平台差异与坑

- `gh` 缺失 / 未登录时透传子进程错误，文案含平台细节（如 `spawn gh ENOENT`）；排查以实际平台输出为准。
- 可用性探测按 `command` 进程内缓存一次；配置了 `proxy` 时注入 `HTTPS_PROXY` / `HTTP_PROXY`，未配置时 gh 继承宿主环境（宿主里的代理变量仍可能生效）。改 `command` 或 `timeoutMs` 后要 `/reload`。
