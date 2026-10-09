# pi-web-search-lite — ARCHITECTURE

模块职责与对外契约边界。模块内部的签名、字段、异常由各模块 README 负责，本文不复述。

## 1. 模块

| 模块 | 职责 | 契约边界 |
|---|---|---|
| `index.ts` | 读配置，按 `tools.*` / `activation` / `guidance.*` 注册两个工具；deferred 时激活内置 `tool_search` | 仅扩展入口：默认导出工厂函数；不导出可复用 API |
| `config/` | 加载、校验、clamp 配置文件，解析 provider 与 API key | `ResolvedConfig` 类型 + 解析函数 + 配置路径；不碰网络 |
| `http/` | 出站 HTTP 唯一出口：代理、超时、UA、`AbortSignal`、错误归一化 | `fetchText` / `fetchJson` 一族；不认 provider 语义 |
| `ssrf/` | 抓取前的静态 URL 判定（协议、主机名、字面量 IP、端口） | 单一断言函数；不解析 DNS、不发请求 |
| `providers/{types,index,tavily,brave,exa}.ts` | 把一次查询翻译成某搜索 API 的请求与统一结果形状 | `SearchProvider` 接口 + 注册表 + 工厂；不认识提取器与工具层 |
| `handlers/{types,index}.ts`、`handlers/github/{index,gh,render}.ts` | 识别专用页面 URL 并产出已清洗正文；不命中或失败返回 `null` | `PageHandler` 接口 + 注册表；github 子目录自管 `gh` 子进程 |
| `extractors/{types,index,tavily,exa,html}.ts` | 按配置顺序尝试多个正文提取器，失败时汇总原因 | `Extractor` 接口 + 链式执行器；不关心 URL 是普通页还是专用页 |
| `tools/{search,fetch,result}.ts` | 编排以上模块，产出模型可读的 `content` 与渲染用 `details` | 两个工具定义对象；唯一允许拼装面向模型文案的地方 |

## 2. 依赖方向

```
index.ts
  ├─→ tools/search.ts ──┐
  └─→ tools/fetch.ts ───┤
                        ├─→ providers/ ──┐
                        ├─→ extractors/ ─┼─→ http/index.ts ──→ ssrf/index.ts
                        ├─→ handlers/ ───┘        ↑
                        ├─→ config/index.ts ──────┘（config 不依赖任何业务模块）
                        └─→ tools/result.ts ──→ 宿主截断工具
```

规则（新代码按此判断放哪）：

- 只能从左向右依赖，禁止反向 import；`config/` / `http/` / `ssrf/` 是叶子，不 import 任何业务模块。
- `providers/` / `extractors/` / `handlers/` 三者互不依赖；需要组合时由 `tools/` 编排。
- 只有 `tools/result.ts` 可以 import 宿主 `@earendil-works/pi-coding-agent` 的截断工具；其余模块不依赖宿主 API，便于单测。
- 面向模型的文案（工具描述、错误清单、结果信封）只出现在 `tools/`；下层模块抛结构化错误（类型 + 消息模板），由工具层拼装。
- Phase 2+ 能力清单见 PLAN §3 / §4；新增时不得改动上述依赖方向，必须改动则先更新本文件。

## 3. 目录与测试约定

- 模块以目录为单位：单文件模块用 `<name>/index.ts`，多文件模块在目录内平铺（如 `providers/tavily.ts`）；模块 README 与实现同目录。
- 测试统一放仓库根 `test/`，命名 `<模块>.test.ts`；模块内多文件时镜像子目录（如 `test/providers/tavily.test.ts`）。测试不进 npm 发布产物。
