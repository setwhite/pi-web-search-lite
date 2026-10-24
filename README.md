**简体中文** | [English](README.en.md)

# pi-web-search-lite

![pi 会话：web_search 用 exa 搜到 5 条结果，web_fetch 紧接着抓到第一页正文](https://raw.githubusercontent.com/setwhite/pi-web-search-lite/main/assets/cover.png)

本扩展为 pi 增加两个工具：`web_search` 搜索网页，`web_fetch` 抓取网页正文。扩展发出的所有请求只经一个代理配置点。

## 设计目标

- 安装后配置一个搜索 key 即可使用。默认抓取链（`html` / `jina`）不需要 key。
- 每条失败路径都给出可操作信息：缺少哪个 key、缺少哪个字段、HTTP 状态码或超时来源。
- 结果超限时自动截断。`context.spillToFile` 默认开启：完整内容写入临时文件，路径写入结果，供 `read` 续读。

取舍与「不做什么」的完整清单见 [docs/adr/](docs/adr/)。

## 安装

```bash
pi install npm:pi-web-search-lite                        # 从 npm 安装
pi install git:github.com/setwhite/pi-web-search-lite    # 从 git 仓库安装
```

配置一个搜索 key 后即可使用。不需要构建。

## 配置

配置只有一个 JSON 文件：`<PI_CODING_AGENT_DIR 或 ~/.pi/agent>/pi-web-search-lite/config.json`。文件不存在时，全部使用默认值。类型、枚举值或未知键写错时，启动失败并指出字段。数值越界不报错：扩展将其 clamp 到允许区间（见 `config/schema.ts` 的 `RANGES` 与 `config/validate.ts`）。示例中的 `//` 注释只用于讲解。实际文件必须是严格 JSON，复制前请删除注释。

**最小配置**：选择一个搜索源，填入它的 key。默认源是 tavily。

```json
{
  "provider": "exa",
  "apiKeys": { "exa": "你的key" }
}
```

key 也可以放在环境变量中（`TAVILY_API_KEY` / `BRAVE_API_KEY` / `EXA_API_KEY` / `FIRECRAWL_API_KEY` / `PERPLEXITY_API_KEY` / `PARALLEL_API_KEY` / `KEENABLE_API_KEY` / `DEEPSEEK_API_KEY` / `JINA_API_KEY`，环境变量优先于文件）。`WEB_SEARCH_PROVIDER` 可临时覆盖 `provider`。

**完整示例**：列出全部配置项，每个键都有注释。除 key、`userAgent`、`proxy` 与 guidance 是示例值外，其余取值就是默认值。

```jsonc
{
  // 搜索源：tavily | brave | exa | firecrawl | perplexity | parallel | keenable | deepseek；可用 WEB_SEARCH_PROVIDER 环境变量覆盖
  "provider": "tavily",
  // API key：需要哪个源就填哪个键，也可以改用环境变量（环境变量优先）
  // 环境变量名：TAVILY_API_KEY / BRAVE_API_KEY / EXA_API_KEY / FIRECRAWL_API_KEY / PERPLEXITY_API_KEY / PARALLEL_API_KEY / KEENABLE_API_KEY / DEEPSEEK_API_KEY / JINA_API_KEY
  "apiKeys": {
    "tavily": "tvly-你的key",
    "brave": "你的key",
    "exa": "你的key",
    "firecrawl": "fc-你的key",
    "perplexity": "pplx-你的key",
    "parallel": "你的key",
    "keenable": "keen_你的key",
    "deepseek": "sk-你的key",
    "jina": "jina-你的key"
  },

  // 代理：扩展自身请求的唯一出口；"" = 直连。gh 子进程另会继承宿主的 HTTP(S)_PROXY（配置了本项时会写入同名变量）
  "proxy": "",
  // 请求超时（毫秒）
  "timeoutMs": 30000,
  // 出站 User-Agent：不写则自动用「包名/版本」，写了就按写的发
  "userAgent": "my-agent/1.0",

  // 工具开关与改名；改成别的名字可避开与其它扩展重名
  "tools": {
    "web_search": { "enabled": true, "name": "web_search" },
    "web_fetch": { "enabled": true, "name": "web_fetch" }
  },
  // eager：工具常驻上下文；deferred：由宿主 tool_search 按需发现，更省上下文
  "activation": "eager",

  // 覆盖内置提示词；不配就用内置的英文单行。每个工具（web_search / web_fetch）可覆盖三个字段：
  //   description        工具描述，会进入工具检索的语料，建议英文
  //   promptSnippet      工具列表里的一行短语
  //   promptGuidelines   系统提示 Guidelines 区的规则，字符串数组
  "guidance": {
    "web_search": {
      "description": "Search the web; returns titles, URLs and snippets.",
      "promptSnippet": "Search the web",
      "promptGuidelines": ["web_search: cite sources as [Title](URL) links."]
    },
    "web_fetch": {
      "description": "Extract content of URL.",
      "promptSnippet": "Extract URL text",
      "promptGuidelines": ["web_fetch: use to get full text of a URL, e.g. docs or URLs found by web_search."]
    }
  },
  // 真正进模型的那道闸：内容超过任一上限就截断；null = 用宿主默认上限，写大于宿主上限的值不生效
  "context": {
    "maxInlineChars": null,  // 按字节截断（下限 1000，写小了会被抬到 1000）
    "maxInlineLines": null,  // 按行截断（下限 50）
    "spillToFile": true      // 截断时把完整文本写到 <tmp>/pi-web-search-lite-*/web-{search,fetch}.md，路径回填进结果供 read 续读；false = 全文丢弃
  },
  // 搜索条数：不传时给多少、最多允许多少
  "search": { "defaultMaxResults": 5, "maxResultsLimit": 10 },
  // 抓取：extractors 是提取器链，按顺序挨个试，第一个能用的胜出；缺 key、报错、正文太短都顺延下一个
  // 推荐顺序 html → 你的 provider → jina：html 与 jina 不需要 key；tavily / exa / firecrawl / parallel / keenable / deepseek 六家既是搜索源也是提取器
  "fetch": {
    "extractors": ["html", "jina"],
    "minChars": 200,
    "allowRaw": false,               // 打开后 web_fetch 才会多出 raw 参数（返回原始响应，跳过 handler 与提取器链）
    "maxCharsPerPage": 150000        // 单页正文上限，见下方「三道 max 闸」
  },
  // 专用页面优先交给对应 handler：github 直接用 gh 的输出，reddit 只换域名后交给提取器链；跳过（失败或关掉）→ 透明顺延，原因记在 details.handlerSkips
  "handlers": {
    "github": {
      "enabled": true,     // false = 完全不碰 gh，GitHub URL 走提取器链
      "command": "gh",     // execFile 直连、不经 shell：只能写可执行文件（PATH 名或绝对路径），不能带参数；Windows 上 .cmd/.bat 会失败
      "timeoutMs": 30000,  // 每个 gh 子进程的超时；可用性探测按 command 在进程内缓存，改完要 /reload
      "maxChars": 150000   // gh 输出渲染成 markdown 后的截断上限，见下方「三道 max 闸」
    },
    "reddit": {
      "enabled": true,    // false = 不换域名，reddit URL 原样走提取器链（不想把链接交给第三方实例就关掉）
      "baseUrl": "https://redlib.catsarch.com"  // reddit 只换域名（path 照抄）交给 redlib 实例，正文仍由提取器链抓；可填自建实例，带子路径也行
    }
  }
}
```

每个键都可省略。取值范围（clamp 区间）与字段语义见 `config/schema.ts` 与 `config/validate.ts`。要覆盖提示词，请填写 `guidance.web_search` / `guidance.web_fetch` 下的字段。

### 三道 max 闸的区别

抓取结果从出网到进模型有三道独立上限。按来源不同，结果经过其中 1–2 道。

| 键 | 作用对象 | 超限后果 |
|---|---|---|
| `fetch.maxCharsPerPage` | 提取器链拿回的正文（不含 GitHub handler） | 切片 + 追加 `[... truncated ...]`，原始全文不再保留 |
| `handlers.github.maxChars` | gh 输出渲染成 markdown 之后 | 同上；只作用于 GitHub handler |
| `context.maxInlineChars` / `maxInlineLines` | 组装好、要发给模型的信封（两个工具都过） | 切片；`spillToFile` 为真时完整文本落临时文件，路径写进结果 |

`context.*` 两个上限经 `Math.min` 夹到宿主上限，写更大的值不生效。GitHub 页面只过第 2、3 道，普通网页只过第 1、3 道，`raw` 只过第 3 道。支持的 GitHub / Reddit URL 形态见 `handlers/github/index.ts` 的 `parseGitHubUrl` 与 `test/handlers/github-url.test.ts`。

## 功能

- 搜网页：从 tavily / brave / exa / firecrawl / perplexity / parallel / keenable / deepseek 中选择一个。扩展不会自动切换搜索源。缺少 key 时，错误信息说明配置位置。
- 抓网页：按 `fetch.extractors` 的顺序逐个尝试提取器，第一个可用者生效。默认顺序是 `html` → `jina`，两者都不需要 key。`tavily` / `exa` / `firecrawl` / `parallel` / `keenable` / `deepseek` 可以插入中间。GitHub 页面优先使用 `gh`。reddit 默认把域名换成 redlib 实例（两者见 [docs/modules/handlers.md](docs/modules/handlers.md)）。`fetch.allowRaw` 打开后才有 `raw` 参数，`raw` 跳过整条链。
- 安全：扩展拒绝内网与回环地址，并逐跳复查重定向。判定只读 URL 中的字面量，不解析 DNS；域名解析到内网时仍放行。结果过长时自动截断。`context.spillToFile` 为真时，全文写入临时文件，路径写入结果。
- 上下文可控：工具可以改名、可以关闭、可以改为按需发现，以减少常驻提示词。
- 提示词精简：内置提示词是英文单行。续读提示、key 位置与参数范围由报错和结果给出，不占提示词。工具改名后，提示词自动更新。

## 环境要求

- pi 宿主。Node.js 22.19.0 或更高版本（见 `package.json` 的 `engines`；宿主可能要求更高版本）。
- `gh` CLI **可选**：只有抓取 GitHub 页面时使用。

## 参考项目

- [nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) —— 提取器链与专用页面 handler 的思路来源。
- [juicesharp/rpiv-mono · rpiv-web-tools](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-web-tools) —— 薄 provider 层、提示词配置面与 TUI 渲染的参考。

两个项目都完整开源。本项目的取舍基于它们的代码。

## 文档索引

- 设计取舍与「不做什么」：[docs/adr/](docs/adr/)（索引：[docs/adr/README.md](docs/adr/README.md)）
- 模块划分与依赖方向：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 术语表：[docs/GLOSSARY.md](docs/GLOSSARY.md)
- 发布记录：[CHANGELOG.md](CHANGELOG.md)

## 开发

```bash
pnpm install
pnpm lint          # biome：lint + 格式检查（warning 也算错；加 --write 自动修正）
pnpm check:imports # 依赖方向闸：docs/ARCHITECTURE.md §2 的可执行版本
pnpm typecheck
pnpm test          # 单元测试，不访问真实网络
pnpm test:e2e      # 可选：真链路冒烟，需要 key 与外网；发版前手动运行，不进 CI
```

CI 在 Linux（Node 22 / 24）与 Windows（Node 22）上运行 lint / check:imports / typecheck / test。`.gitattributes` 把行尾固定为 LF，两个平台上的 biome 结果一致。pnpm 版本由 `packageManager` 固定。格式与 lint 规则见 `biome.json`（`lineWidth` 100）。

提交前闸（可选，仓库内生效）：运行 `git config core.hooksPath .githooks`。此后每次提交运行 lint / `check:imports` / typecheck / test 四条命令，约 10 秒。

发版：修改 `package.json` 的 `version`，在 `CHANGELOG.md` 增加条目，然后推送 `main`。`.github/workflows/npm-publish.yml` 负责发布；registry 上已有该版本时，整条运行跳过。
