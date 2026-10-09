**简体中文** | [English](README.en.md)

# pi-web-search-lite

![pi 会话：web_search 用 exa 搜到 5 条结果，web_fetch 紧接着抓到第一页正文](https://raw.githubusercontent.com/setwhite/pi-web-search-lite/main/assets/cover.png)

给 pi 加两个工具：`web_search` 搜网页、`web_fetch` 抓网页正文；所有出站请求走同一个代理。

## 安装

```bash
pi install npm:pi-web-search-lite                        # 从 npm 安装
pi install git:github.com/setwhite/pi-web-search-lite    # 从 git 仓库安装
```

装完配一个搜索 key 就能用，不需要构建。

## 配置

一个 JSON 文件：`<PI_CODING_AGENT_DIR 或 ~/.pi/agent>/pi-web-search-lite/config.json`。文件不存在时全用默认值；字段写错会启动失败，并告诉你错在哪个字段。

**最小可用配置**——填上自己的 key 就能用：

```json
{
  "apiKeys": { "tavily": "tvly-你的key" }
}
```

key 也可以走环境变量（`TAVILY_API_KEY` / `BRAVE_API_KEY` / `EXA_API_KEY` / `FIRECRAWL_API_KEY` / `PERPLEXITY_API_KEY` / `JINA_API_KEY`，优先于文件）；换默认搜索源改 `provider`，也能用 `WEB_SEARCH_PROVIDER` 环境变量临时覆盖。

**完整示例**——列全所有配置项，注释说明每个键干什么；除 key、userAgent 和 guidance 是覆盖示例外，其余值就是默认值：

```jsonc
{
  // 搜索源：tavily | brave | exa | firecrawl | perplexity；调用时也能用 provider 参数临时指定
  "provider": "tavily",
  // API key：需要哪个源就填哪个键，也可以改用环境变量（环境变量优先）
  // 环境变量名：TAVILY_API_KEY / BRAVE_API_KEY / EXA_API_KEY / FIRECRAWL_API_KEY / PERPLEXITY_API_KEY / JINA_API_KEY
  "apiKeys": {
    "tavily": "tvly-你的key",
    "brave": "你的key",
    "exa": "你的key",
    "firecrawl": "fc-你的key",
    "perplexity": "pplx-你的key",
    "jina": "jina-你的key"
  },

  // 代理：所有出站请求的唯一出口；"" = 直连
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
  // 结果进模型的体积上限：null = 用宿主默认上限；超出截断并默认把全文写进临时文件供继续读
  "context": { "maxInlineChars": null, "maxInlineLines": null, "spillToFile": true },
  // 搜索条数：不传时给多少、最多允许多少
  "search": { "defaultMaxResults": 5, "maxResultsLimit": 10 },
  // 抓取：默认只用本地 html 与 r.jina.ai（两位都不需要 key）；要 tavily / exa / firecrawl 就自己加进来；正文短于 minChars 视为无效；allowRaw 打开后才会出现 raw 参数（默认关）
  "fetch": {
    "extractors": ["html", "jina"],
    "minChars": 200,
    "allowRaw": false,
    "maxCharsPerPage": 150000
  },
  // GitHub 页面交给 gh CLI 处理：换命令、改上限在这里
  "handlers": { "github": { "enabled": true, "command": "gh", "timeoutMs": 30000, "maxChars": 150000 } }
}
```

每个键都可省略。默认值与取值范围见 `config/README.md`；要覆盖提示词就往 `guidance.web_search` / `guidance.web_fetch` 里填字段。

## 功能

- 搜网页：tavily / brave / exa / firecrawl / perplexity 任选一个，不会偷偷换源；缺 key 会直接告诉你配哪里。
- 抓网页：按你配的顺序挨个试提取器，第一个能用的胜出（默认 `html` → `jina`，两位都不需要 key）；`tavily` / `exa` / `firecrawl` 要自己加进 `fetch.extractors`；GitHub 页面优先用 `gh`；想直接拿原始响应，把 `fetch.allowRaw` 打开后才有 `raw` 参数。
- 安全与省心：内网 / 回环地址直接拒绝，重定向逐跳复查；结果太长自动截断，全文落到临时文件。
- 上下文可控：工具可改名、可关闭、可改成按需发现，减少常驻提示词。
- 提示词精简：内置提示词是英文单行；续读提示、key 位置、参数范围这些信息由报错与结果承载，不占提示词；工具改名后提示词自动跟着变。

## Requirements

- pi 宿主（Node 版本随宿主要求）。
- `gh` CLI **可选**：只有抓 GitHub 页面会用到，没装不影响其它功能。

## 参考项目

- [nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) —— 提取器链与专用页面 handler 的思路来源。
- [juicesharp/rpiv-mono · rpiv-web-tools](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-web-tools) —— 薄 provider 层、提示词配置面与 TUI 渲染的参考。

两者的方案完整开源，本项目的取舍建立在读它们代码的基础上。

## 文档索引

- 设计目标与取舍：`docs/PLAN.md`
- 模块划分与依赖方向：`docs/ARCHITECTURE.md`
- 任务台账：`docs/TODO.md`
- 实测记录：`docs/VERIFICATION.md`
- 模块 API 与契约：各目录下的 `README.md`（`config/`、`http/`、`ssrf/`、`providers/`、`handlers/`、`extractors/`、`tools/`）

## 开发

```bash
pnpm install
pnpm test        # 单元测试，不打真实网络
pnpm typecheck
```

CI 在 Linux 与 Windows 上跑这两条命令；pnpm 版本由 `packageManager` 字段锁定。
