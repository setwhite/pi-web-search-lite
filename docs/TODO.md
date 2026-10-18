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

- [x] T18 新增 Parallel / Keenable / DeepSeek 三家搜索源与提取器
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

- [x] T19 http 层：网络错误文案带病因 + 跨源重定向摘掉全部认证头
  - 交付物：`http/index.ts`（`describeCause` 展开 cause 链；`dropSensitiveHeaders` 按头名族判定）、`docs/modules/http.md`
  - 验收：
    - 连接被拒 / DNS 失败的 `network` 错误消息含底层 code（`ECONNREFUSED` / `ENOTFOUND`）与地址，不再是裸的 `fetch failed`
    - 多地址（`AggregateError`）场景消息非空，code 与各地址都在
    - 跨 origin 重定向后 `authorization` / `x-api-key` / `x-subscription-token` 不出现在下一跳，`accept` 等非认证头保留；首跳同源仍带认证头
  - 验收证据：`test/http.test.ts` 的「http：网络错误文案」「http：跨源重定向的认证头」两组
  - 前置：无

- [x] T20 handlers/github：release tag 加参数分界
  - 交付物：`handlers/github/index.ts`（`release view` 的 tag 校验或 `--` 分界）
  - 验收：`/o/r/releases/tag/--repo` 这类以 `-` 开头的 tag 不会被 gh 当开关解析（落到提取器链或作为位置参数）
  - 验收证据：`test/handlers/github.test.ts` 的「release：tag 走 -- 分界」（`test/handlers/github-url.test.ts` 的两条只钉住解析层选择——`-` 开头的 tag 仍解析为 release，改动前就绿，不算 AC 证据）
  - 前置：T19

- [x] T21 providers：`DEFAULT_PROVIDER` 收成单源
  - 交付物：`providers/index.ts`（删本地常量与第三层回落、参数去掉 `| undefined`、头注释同步）、`test/providers/index.test.ts`
  - 验收：`DEFAULT_PROVIDER` 只在 `config/schema.ts` 定义一处；`resolveProviderId` 只做 env > config 两层
  - 验收证据：`test/providers/index.test.ts`
  - 前置：T19

## 待决（未成任务）

- biome 风格闸（审查 #4）：需先批准 devDependency + CI 改动；`lineWidth` 按现状（源码 p90 ≈ 88）定 100/120，否则首次格式化 diff 过大。
- release tag 未过 `safeRef`（T20 只做 `--` 分界，tag 是唯一没做边界校验的 ref 类取值）：`/releases/tag/a%00b` 会让 execFile 抛 `The argument 'args[7]' must be a string without null bytes`，被 `handlers/github/gh.ts` 的 catch 吞成 `skipped`，模型看到的是 Node 内部文案；`%0Ab` 这类控制字符则原样进 argv（execFile 无 shell，gh 只会 404）。修法是复用 `safeRef`（与 blob/tree 对齐，非法即返回 null 落到提取器链），1 行 + 1 条用例。
- `test/handlers/github.test.ts` 的 gh 探测样板（`--version` / `auth status` 两连成功）复制到第 4 份（T20 审计提出，已足 Rule of Three）：抽一个测试内 executor 就能收掉，属测试重构，按 `_shared/testing.md`「重构不在 TDD 循环里」当独立任务做。
- 16 张 provider / extractor 表是否抽象（审查 #5）：当前决定**不动**（认证头名、请求体字段、响应路径、错误约定各不相同），等第 9 家再加入口。
