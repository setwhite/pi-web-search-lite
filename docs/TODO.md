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

- [x] T22 handlers/github：release tag 过 `safeRef`
  - 交付物：`handlers/github/index.ts`（`releases/tag` 的 tag 复用 `safeRef`）、`docs/modules/handlers.md`
  - 验收：`/O/R/releases/tag/a%00b` 这类含控制字符（以及空、超 1024 字符）的 tag 不命中 handler，落到提取器链，不再把 Node 的 `must be a string without null bytes` 文案透给模型
  - 验收证据：`test/handlers/github-url.test.ts` 的「不命中」清单
  - 前置：T20（已完成）

- [x] T23 测试：gh 探测样板收进 `ghStub`
  - 交付物：`test/handlers/fixtures.ts`（`ghStub`）、`test/handlers/github.test.ts`、`test/tools/fetch.test.ts`、`test/regression/messages.test.ts`
  - 验收：手写的 `--version` / `auth status` 探测桩只剩「探测期间被中断」一条（它断言探测内部行为，不是样板），其余调用点统一走 `ghStub`；断言语义不变
  - 验收证据：`rg -c 'args\[0\] === "--version"' test/` 只剩 `fixtures.ts` 与该条用例；`pnpm test` 34 files / 300 tests
  - 前置：无

- [x] T24 引入 biome 做 lint + 格式闸
  - 交付物：`biome.json`、`package.json`（`lint` 脚本）、`README.md` / `README.en.md` 开发段、`ci.yml` 与 `npm-publish.yml` 的 lint 步骤、`devDependencies`
  - 验收：`pnpm lint`（= `biome check .`）零诊断；CI 与本地同一条命令；`lineWidth` 100 —— 现状源码 p90 实测 89、最长 187，取 100 让既有代码里没被折的行保持原样；重排量随宽度单调下降（88 / 100 / 120 / 140 → 3156 / 2196 / 903 / 407 改动行 = 74 / 73 / 49 / 25 个文件，在 HEAD 副本上用同一 biome 实测），此处不追最小重排：120 会把行宽上限整体抬高
  - 验收证据：`pnpm exec biome check . --reporter=summary` 只输出 `Checked N files`；`pnpm test` 35 files / 303 tests
  - 进度：已提交——工具与 9 处 lint 修复随 db73099；格式化重排随 3509915（71 个文件）与 911eb7f（`http/index.ts` 单独一枚，它带着待审的手改）；`biome.json` 随 160679f；两个工作流的 lint 步骤随 b64a87b；英文 README 与 `docs/ARCHITECTURE.md` 的口径随 708768e
  - 前置：T22 / T23 先提交——已完成（efeff50 / 20a51c1）

- [x] T25 桩 server 的临时端口绕开 undici 的 bad port 名单
  - 交付物：`test/stub.ts`（`listenEphemeral`）、`test/undici-internals.d.ts`、`test/stub.test.ts`，以及 `test/http.test.ts` / `test/ssrf.test.ts` / `test/regression/chain.test.ts` 的 6 个调用点
  - 验收：`listen(0)` 抽到名单内端口时关掉重抽，连续 10 次抽不到就明确报错而不是让用例超时；全套测试不再因 `bad port` 随机红
  - 验收证据：`test/stub.test.ts` 三例（直接返回 / 重抽一次 / 连续命中报错）；`pnpm test` 35 files / 303 tests
  - 前置：无
  - 来源：T24 验收首跑红——`test/extractors/firecrawl.test.ts:70` 收到 `network error: … fetch failed; bad port`；根因是本机动态端口段 1024–15000（`netsh int ipv4 show dynamicport tcp`）与 undici 的 82 个 bad port（全部 ≤ 10080）重叠，实测抽到 6566
  - 进度：已随 a1503e5 提交（6 文件）；`pnpm test` 在本会话跑 6 次全绿（35 files / 303 tests，含一次 3 连跑）

## 待决（未成任务）

- `HttpError.status` / `.body` 是否删（本会话提出，全仓零生产读者、只有 `test/http.test.ts:113,117` 读）：决定**保留**——口径写进 `http/index.ts` 注释与 `docs/modules/http.md`，将来要按状态码做事（如 429 退避）或把错误页正文给模型时直接用。注意 `body` 是整页、不截断。
- 16 张 provider / extractor 表是否抽象（审查 #5）：决定**不动**——认证头名、请求体字段、响应路径、错误约定各不相同，等第 9 家再加入口（用户已确认）。
