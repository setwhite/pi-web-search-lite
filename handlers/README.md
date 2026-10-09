# handlers/ — 专用页面 handler 层

`web_fetch` 的第 0 步：命中且成功 → 跳过整条提取器链；命中但跳过（未装 gh / 未登录 / 命令失败）→ 返回 `skipped` 加原因，由工具层在结果里注明后顺延（透明顺延，不是静默降级）。不 clone、不落盘、不发 HTTP。

## 文件

| 文件 | 内容 |
|---|---|
| `types.ts` | `PageHandler` / `HandlerContext` / `HandlerSuccess` / `HandlerSkip` 与 `GhExecutor` 契约 |
| `index.ts` | 注册表 `PAGE_HANDLERS`（MVP 只有 github）与 `runPageHandlers(url, ctx)` |
| `github/index.ts` | `parseGitHubUrl`、命中判定、`gh` 命令计划、字段回退、`githubHandler` |
| `github/gh.ts` | 默认执行器 `execGh`（execFile 包装）、`ghEnv`、`checkGhAvailable`（探测缓存）、`resetGhProbeCache` |
| `github/render.ts` | gh 输出 → markdown（标题 / 状态 / 作者 / 正文 / 评论）+ `truncateText` |

## API

```ts
runPageHandlers(url, ctx): Promise<{ result: HandlerSuccess | null; skips: HandlerSkip[] }>
parseGitHubUrl(url): GitHubTarget | null
githubHandler: PageHandler            // name = "github"
checkGhAvailable(command, { exec, timeoutMs, env, signal }): Promise<{ ok, reason }>
```

`HandlerContext` = `{ github: GitHubHandlerSettings; proxy?; signal?; execGh? }`；`execGh` 仅测试注入，生产走 `execGh`（真实 execFile）。

## 支持的 URL（`github.com` / `www.github.com`）

| 形态 | gh 命令 |
|---|---|
| `/O/R` | `gh repo view O/R --json …` + `gh api repos/O/R/readme --jq .content` |
| `/O/R/blob/REF/PATH` | `gh api -H "Accept: application/vnd.github.raw" repos/O/R/contents/PATH?ref=REF` |
| `/O/R/tree/REF[/PATH]` | `gh api repos/O/R/git/trees/REF?recursive=1 --jq .tree[].path`（渲染时截前 200 条） |
| `/O/R/issues/N` | `gh issue view N --repo O/R --json …`（老 gh 不认字段时回退 core 字段集） |
| `/O/R/pull/N`（含 `/files`） | `gh pr view …`；`/files` 走 `gh pr diff` |
| `/O/R/releases/tag/T` | `gh release view T --repo O/R --json …` |

其余（gist / wiki / actions / discussions / settings / `/O/R/pull/N/commits` 等）返回 `null`，交给提取器链。query 与锚点忽略。

## 已知 URL 局限（MVP 有意不处理）

- 分支名含 `/`：`/O/R/blob/feat/x/file.ts` 会被解析成 `ref=feat`、`path=x/file.ts`，gh 请求的其实是错误路径；请求失败后返回 `skipped` 顺延到提取器链。`tree` 同理。
- `/O/R/releases/latest`：只支持 `/releases/tag/<tag>`，`latest` 不命中，直接走提取器链。

## gh 子进程约定

- 探测：`gh --version` + `gh auth status`，按 `command` 进程内缓存一次；失败即整个 handler 跳过，不做逐 URL 探测。
- env：`GH_PROMPT_DISABLED=1`、`GIT_TERMINAL_PROMPT=0`；配置了 `proxy` 时注入 `HTTPS_PROXY` / `HTTP_PROXY`。
- 超时 / 缓冲：`handlers.github.timeoutMs`、10MB。
- 输出超 `handlers.github.maxChars` 时由 `truncateText` 截断并标记 `truncated`；工具层仍会按 context 上限再截。
