# config/

配置文件加载、校验与 clamp。只依赖 `node:` 标准库，不碰网络与宿主 API。

## 文件位置

`<agent dir>/pi-web-search-lite/config.json`，其中 `<agent dir>` = `PI_CODING_AGENT_DIR` > `~/.pi/agent`。
文件不存在按全默认值处理。

## API

```ts
loadConfig(options?: { configPath?: string; env?: NodeJS.ProcessEnv }): ResolvedConfig
defaultConfigPath(env?: NodeJS.ProcessEnv): string
```

- `configPath` 缺省由 `env` 推导；`env` 缺省 `process.env`（测试可注入）。
- JSON 损坏、顶层非对象、字段非法 → 抛 `Error`，消息含配置文件的绝对路径；字段非法时逐条列出 `<字段路径>：<原因>`。
- 数值字段越界不报错，clamp 到 `schema.ts` 的 `RANGES` 区间；`context.maxInlineChars` / `maxInlineLines` 只保证下限，上限（宿主 `DEFAULT_MAX_BYTES` / `DEFAULT_MAX_LINES`）由 `tools/` 截断时对齐（config 不依赖宿主 API）。
- API key：`TAVILY_API_KEY` / `BRAVE_API_KEY` / `EXA_API_KEY` 优先于文件 `apiKeys.<provider>`；空字符串环境变量视为未设置。
- 校验还包括：`provider` / `fetch.extractors` 枚举、`tools.*.name` 命名规则与保留名、两工具不能同时 `enabled: false`、`proxy` 仅 http(s)。

## 文件

| 文件 | 内容 |
| --- | --- |
| `schema.ts` | 公开常量、类型（`ResolvedConfig` 等）、默认值、clamp 区间；`VERSION` 运行时读自 package.json |
| `validate.ts` | 逐字段校验、clamp、env key 合并；错误文本在此生成 |
| `readers.ts` | 基础读取器：`undefined` 回退，类型不符记错并回退 |
| `index.ts` | `loadConfig` / `defaultConfigPath`；重导出 `schema.ts` 全部符号 |
