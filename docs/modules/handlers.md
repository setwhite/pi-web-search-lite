# handlers/ — 专用页面 handler 层

`web_fetch` 的第 0 步：命中后要么直接产出正文（github 调 `gh`），要么只把 URL 换个域名（reddit 换 redlib）再交给提取器链；命中但跳过（未装 gh / 未登录 / 命令失败 / handler 被关掉）→ 返回 `skipped` 和原因，由工具层在结果里注明后顺延（透明顺延，不是静默降级）。不 clone、不落盘、不直接发 HTTP。

## 文件

| 文件 | 内容 |
|---|---|
| `types.ts` | `PageHandler` / `HandlerContext` / `HandlerSuccess` / `HandlerSkip` / `HandlerRewrite` 与 `GhExecutor` 契约 |
| `index.ts` | 注册表 `PAGE_HANDLERS`（github、reddit）与 `runPageHandlers(url, ctx)` |
| `github/index.ts` | `parseGitHubUrl`、命中判定、`gh` 命令计划、字段回退、`githubHandler` |
| `github/gh.ts` | 默认执行器 `execGh`（execFile 包装）、`ghEnv`、`checkGhAvailable`（探测缓存）、`resetGhProbeCache` |
| `github/render.ts` | gh 输出 → markdown（标题 / 状态 / 作者 / 正文 / 评论）+ `truncateText` |
| `reddit/index.ts` | `REDDIT_HOSTS` 白名单、`redditHandler`（只改写 URL）、`substituteHost` |

## API

```ts
runPageHandlers(url, ctx): Promise<{ result: HandlerSuccess | null; skips: HandlerSkip[]; rewrite?: HandlerRewrite }>
parseGitHubUrl(url): GitHubTarget | null
githubHandler: PageHandler            // name = "github"
redditHandler: PageHandler            // name = "reddit"
substituteHost(url: URL, baseUrl: string): string
checkGhAvailable(command, { exec, timeoutMs, env, signal }): Promise<{ ok, reason }>
```

`HandlerContext` = `{ github: GitHubHandlerSettings; reddit: RedditHandlerSettings; proxy?; signal?; execGh? }`；`ctx.execGh` 仅测试注入，生产用 `gh.ts` 的 `execGh`（真实 execFile）。`rewrite` 只在 handler 不改正文、只换域名时出现（`{ kind: "rewrite", handler, from, url }`）：工具层用 `url` 抓，把 `from` 写进结果头 `Rewritten from:`，并重跑一遍 SSRF 检查。

## 支持的 URL（`github.com` / `www.github.com`）

| 形态 | gh 命令 |
|---|---|
| `/O/R` | `gh repo view O/R --json …` + `gh api repos/O/R/readme --jq .content` |
| `/O/R/blob/REF/PATH` | `gh api -H "Accept: application/vnd.github.raw" repos/O/R/contents/PATH?ref=REF` |
| `/O/R/tree/REF[/PATH]` | `gh api repos/O/R/git/trees/REF?recursive=1 --jq .tree[].path`（渲染时截前 200 条） |
| `/O/R/issues/N` | `gh issue view N --repo O/R --json …`（老 gh 不认字段时回退 core 字段集） |
| `/O/R/pull/N`（含 `/files`） | `gh pr view …`（老 gh 不认字段时同样回退 core 字段集）；`/files` 走 `gh pr diff` |
| `/O/R/releases/tag/T` | `gh release view --repo O/R --json … -- T`（tag 取自 URL，可能以 `-` 开头，所以 flag 全排在 `--` 之前；gh 用 pflag，`--` 之后只当位置参数） |

其余（gist / wiki / actions / discussions / settings / `/O/R/pull/N/commits` 等）返回 `null`，交给提取器链。忽略 query 与锚点。`blob` / `tree` 的 ref 与 `releases/tag` 的 tag 同过 `safeRef`：空、超 1024 字符、含控制字符（含 `%00`）一律不命中——这些字符进 `gh` 参数会被 `execFile` 拒绝（`must be a string without null bytes`），报错文案来自 Node 而非本层。

## 已知 URL 局限（MVP 有意不处理）

- 分支名含 `/`：`/O/R/blob/feat/x/file.ts` 会被解析成 `ref=feat`、`path=x/file.ts`，gh 请求的其实是错误路径；请求失败后返回 `skipped` 顺延到提取器链。`tree` 同理。
- `/O/R/releases/latest`：只支持 `/releases/tag/<tag>`，`latest` 不命中，直接走提取器链。

## Reddit：只换域名（`reddit/index.ts`）

命中白名单（`reddit.com` 及 `www` / `old` / `new` / `np` / `m` / `i` 子域，加 `redd.it` / `www.redd.it`）就把域名换成 `handlers.reddit.baseUrl`（默认 `https://redlib.catsarch.com`，可带子路径；baseUrl 自带的路径前缀保留）；path 与 query 原样、丢掉锚点，正文仍由全局 `fetch.extractors` 抓，结果头多一行 `Rewritten from: <原 URL>`。帖子页 `/r/<sub>/comments/<id>/<slug>/` 与 redlib 路由一一对应，换个域名就能拿到正文。

- 媒体域 `i.redd.it` / `v.redd.it` / `preview.redd.it` 不在白名单，不会被改写（白名单里的 `i.reddit.com` 是站点路由，不是媒体域）。
- 不做 handler 专属提取链：要绕实例的反爬（如 Anubis 挑战页），改全局 `fetch.extractors` 或用别的实例；挑战页是 HTTP 200 且字数够 `minChars`，会被当成成功。
- redlib 没有的路由（`/comments/<id>/comment/<cid>`、`/gallery/<id>`）只回一句 `Nothing here`，字数不够 `minChars`，由链顺延并报错。

## 平台差异

`gh` 缺失 / 未登录时透传子进程错误，文案含平台细节（如 `spawn gh ENOENT`）；排查以实际平台输出为准。

## gh 子进程约定

- 探测：`gh --version` + `gh auth status`，按 `command` 进程内缓存一次；失败即整个 handler 跳过，不做逐 URL 探测。
- env：`GH_PROMPT_DISABLED=1`、`GIT_TERMINAL_PROMPT=0`；配置了 `proxy` 时注入 `HTTPS_PROXY` / `HTTP_PROXY`；未配置时 gh 继承宿主环境，宿主里的代理变量仍可能生效。
- 失败：首条命令失败即放弃整个 handler（返回 skip）；附加命令（repo 的 README）失败只丢弃该段，已取到的元数据仍渲染。
- 超时 / 缓冲：`handlers.github.timeoutMs`、10MB。
- 输出超 `handlers.github.maxChars` 时由 `truncateText` 截断并标记 `truncated`；工具层仍会按 context 上限再截。
