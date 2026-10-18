# pi-web-search-lite — 任务台账

按开发顺序排列；状态只随用户确认变更。规则：

1. 领取：取第一条 `- [ ]` 且「前置」全部完成的原子任务；任务目标或接口契约不明确时先提问，不猜测。
2. 实现：一次只推进一步（先写失败测试 Red，再补最少实现 Green）；遇 Bug 先加 Log 或查堆栈验证假设；同一错误连续失败 3 次停机汇报。
3. 交付：新模块固定为**实现 + 模块文档 + 单元测试**三件套；收工跑 `pnpm test` 与 `pnpm typecheck`（见 `docs/ARCHITECTURE.md` §3）。
4. 证据：只记可复跑的指针（测试文件 / 命令输出 / commit），且必须是当前会话产生；实现会话不改状态，挂起等用户 Review。
5. 审计：在没参与实现的会话里做，只读不改仓库文件，证据只认该会话的运行输出。
6. 边界：契约与理由分别落在 `docs/modules/` 与 `docs/adr/`，本文件不复述。

状态：`- [ ]` = 未完成（用户确认的中间态在行尾标注 `进行中` / `待审` / `打回`），`- [x]` = 已确认完成。T1–T17 已随文档重构（提交 `dab115a`）移出本文件。

## 任务

- [~] T18 新增 Parallel / Keenable / DeepSeek 三家搜索源与提取器（待审）
  - 交付物：`providers/{parallel,keenable,deepseek}.ts`、`extractors/{parallel,keenable,deepseek}.ts`、`config/schema.ts` 的枚举与 key 环境变量、根 README 两版（最小配置与 provider 清单）
  - 验收：
    - `provider` 与 `fetch.extractors` 都接受 `parallel` / `keenable` / `deepseek`；默认值不变（`tavily` / `html,jina`）
    - 三个搜索源：请求形状正确，响应走统一映射（缺 title 用 url、缺 url 丢弃）
    - 三个提取器：请求形状正确，缺 key 跳过，响应缺字段抛错
    - `PARALLEL_API_KEY` / `KEENABLE_API_KEY` / `DEEPSEEK_API_KEY` 与 `apiKeys.*` 等价，环境变量优先
    - 缺 key 的报错同时给出环境变量名与 `config.apiKeys.<id>`
    - README 中英两版一致：最小可用配置含 `provider` 与对应 key，provider 清单含三家
  - 验收证据：`test/providers/{parallel,keenable,deepseek}.test.ts`、`test/extractors/{parallel,keenable,deepseek}.test.ts`、`test/config.test.ts`
  - 前置：无
