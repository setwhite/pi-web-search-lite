**简体中文** | [English](README.en.md)

# pi-web-search-lite

![pi 会话：web_search 用 exa 搜到 5 条结果，web_fetch 紧接着抓到第一页正文](https://raw.githubusercontent.com/setwhite/pi-web-search-lite/main/assets/cover.png)

给 pi 加两个工具：`web_search` 搜网页、`web_fetch` 抓网页正文；扩展自身发出的请求都走同一个代理配置点。

## 设计目标

- 只做 `web_search` + `web_fetch` 两个工具，扩展自身的出站请求经同一个代理配置点。
- 装完配一个搜索 key 就能用；抓取默认链（`html` / `jina`）不需要 key。
- 每条失败路径都给出可操作信息：缺哪个 key、缺哪个字段、HTTP 状态或超时来源。
- 结果超限自动截断；`context.spillToFile` 默认开启，完整内容落临时文件，路径写进结果供 `read` 续读。

取舍与「不做什么」的完整清单见 [docs/adr/](docs/adr/)。

## 安装

```bash
pi install npm:pi-web-search-lite                        # 从 npm 安装
pi install git:github.com/setwhite/pi-web-search-lite    # 从 git 仓库安装
```

装完配一个搜索 key 就能用，不需要构建。

## 配置

配置只有一个 JSON 文件：`<PI_CODING_AGENT_DIR 或 ~/.pi/agent>/pi-web-search-lite/config.json`，不存在时全用默认值。类型、枚举名或未知键写错会启动失败并指出字段；数值越界不报错，静默 clamp 到区间（见 [docs/modules/config.md](docs/modules/config.md)）。示例里的 `//` 注释只为讲解，实际文件必须是严格 JSON，拷走前先删掉。

**最小可用配置**——挑一个搜索源、填上它的 key 就能用（默认源是 tavily）：

```json
{
  "provider": "exa",
  "apiKeys": { "exa": "你的key" }
}
```

key 也可以放环境变量（`TAVILY_API_KEY` / `BRAVE_API_KEY` / `EXA_API_KEY` / `FIRECRAWL_API_KEY` / `PERPLEXITY_API_KEY` / `PARALLEL_API_KEY` / `KEENABLE_API_KEY` / `DEEPSEEK_API_KEY` / `JINA_API_KEY`，优先于文件）；`WEB_SEARCH_PROVIDER` 可临时覆盖 `provider`。

**完整示例**——列全所有配置项，每个键都有注释；除 key、userAgent、`proxy` 和 guidance 是示例值外，其余就是默认值：

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

每个键都可省略，上面示例里除 key、userAgent、`proxy`、guidance 之外的取值就是默认值。取值范围（clamp 区间）与字段语义见 [docs/modules/config.md](docs/modules/config.md)；要覆盖提示词就往 `guidance.web_search` / `guidance.web_fetch` 里填字段。

### 三道 max 闸，别混

抓取结果从出网到进模型有三道独立上限，按来源经过其中 1–2 道：

| 键 | 作用对象 | 超限后果 |
|---|---|---|
| `fetch.maxCharsPerPage` | 提取器链拿回的正文（不含 GitHub handler） | 切片 + 追加 `[... truncated ...]`，原始全文不再保留 |
| `handlers.github.maxChars` | gh 输出渲染成 markdown 之后 | 同上；只作用于 GitHub handler |
| `context.maxInlineChars` / `maxInlineLines` | 组装好、要发给模型的信封（两个工具都过） | 切片；`spillToFile` 为真时完整文本落临时文件，路径写进结果 |

`context.*` 两个上限用 `Math.min` 夹到宿主上限，写大了不生效；GitHub 页面只过第 2、3 道，普通网页只过第 1、3 道，`raw` 只过第 3 道。支持的 GitHub / Reddit URL 形态见 [docs/modules/handlers.md](docs/modules/handlers.md)。

## 功能

- 搜网页：tavily / brave / exa / firecrawl / perplexity / parallel / keenable / deepseek 任选一个，不会偷偷换源；缺 key 会直接告诉你配哪里。
- 抓网页：按 `fetch.extractors` 顺序逐个尝试提取器，第一个能用的胜出（默认 `html` → `jina`，两位都不需要 key；`tavily` / `exa` / `firecrawl` / `parallel` / `keenable` / `deepseek` 可以插到中间）。GitHub 页面优先用 `gh`，reddit 默认把域名换成 redlib 实例（两者见 [docs/modules/handlers.md](docs/modules/handlers.md)）；`fetch.allowRaw` 打开后才有 `raw` 参数，raw 跳过整条链。
- 安全与省心：内网 / 回环地址直接拒绝，重定向逐跳复查——只判 URL 里的字面量，不解析 DNS（域名解析到内网仍放行）；结果太长自动截断，`context.spillToFile` 为真时全文落到临时文件（路径写进结果）。
- 上下文可控：工具可改名、可关闭、可改成按需发现，减少常驻提示词。
- 提示词精简：内置提示词是英文单行；续读提示、key 位置、参数范围这些信息都由报错和结果给出，不占提示词；工具改名后提示词自动跟着变。

## 环境要求

- pi 宿主；Node.js >= 22.19.0（`package.json` 的 `engines`，宿主可能要求更高）。
- `gh` CLI **可选**：只有抓 GitHub 页面会用到，没装不影响其它功能。

## 参考项目

- [nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) —— 提取器链与专用页面 handler 的思路来源。
- [juicesharp/rpiv-mono · rpiv-web-tools](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-web-tools) —— 薄 provider 层、提示词配置面与 TUI 渲染的参考。

两个项目都完整开源，本项目的取舍基于它们的代码。

## 文档索引

- 设计取舍与「不做什么」：[docs/adr/](docs/adr/)（索引：[docs/adr/README.md](docs/adr/README.md)）
- 模块划分与依赖方向：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 术语表：[docs/GLOSSARY.md](docs/GLOSSARY.md)
- 模块 API 与契约：[docs/modules/](docs/modules/)（[config](docs/modules/config.md)、[http](docs/modules/http.md)、[ssrf](docs/modules/ssrf.md)、[providers](docs/modules/providers.md)、[handlers](docs/modules/handlers.md)、[extractors](docs/modules/extractors.md)、[tools](docs/modules/tools.md)）
- 发布记录：[CHANGELOG.md](CHANGELOG.md)

## 开发

```bash
pnpm install
pnpm lint          # biome：lint + 格式检查（warning 也算错；加 --write 即自动修正）
pnpm check:imports # 依赖方向闸：docs/ARCHITECTURE.md §2 的可执行版本
pnpm typecheck
pnpm test          # 单元测试，不打真实网络
pnpm test:e2e      # 可选：真链路冒烟，需要 key 与外网，发版前手跑，不进 CI
```

CI 在 Linux（Node 22 / 24）与 Windows（Node 22）上跑 lint / check:imports / typecheck / test；行尾由 `.gitattributes` 固定为 LF，两边的 biome 结果一致。pnpm 版本由 `packageManager` 字段锁定，格式与 lint 规则见 `biome.json`（`lineWidth` 100）。

提交前闸（可选，仓库内生效）：`git config core.hooksPath .githooks`，之后每次提交跑上面 lint / `check:imports` / typecheck / test 四条，约 10 秒。

发版：改 `package.json` 的 `version` 与 `CHANGELOG.md`，推送 `main` 即由 `.github/workflows/npm-publish.yml` 发布（registry 上已有该版本则整条跳过）。
