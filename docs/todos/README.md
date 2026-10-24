# pi-web-search-lite — 任务台账

`docs/todos/` 的索引兼阶段表：单文件维护，任务不拆成 `T<NN>.md`。按开发顺序排列；状态只随用户确认变更。规则：

1. 领取：取第一条 `- [ ]` 且「前置」全部完成的原子任务；任务目标或接口契约不明确时先提问，不猜测。
2. 实现：一次只推进一步（先写失败测试 Red，再补最少实现 Green）；遇 Bug 先加 Log 或查堆栈验证假设；同一错误连续失败 3 次停机汇报。
3. 交付：新模块固定为**实现 + 模块文档 + 单元测试**三件套；收工跑 `pnpm lint`、`pnpm check:imports`、`pnpm test` 与 `pnpm typecheck`（见 `docs/ARCHITECTURE.md` §3）。
4. 证据：只记可复跑的指针（测试文件 / 命令输出 / commit），且必须是当前会话产生；实现会话不改状态，挂起等用户 Review。
5. 审计：在没参与实现的会话里做，只读不改仓库文件，证据只认该会话的运行输出。
6. 边界：契约在代码与测试，理由在 `docs/adr/`，本文件不复述。

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

- [x] T26 钉住 undici 隐式契约并升级到 8.12.3
  - 交付物：`test/undici-surface.test.ts`、`docs/modules/http.md`（「验证局限」改成实测口径 + 新增「依赖升级」）、`package.json` / `pnpm-lock.yaml`（`undici` 8.10.2 → 8.12.3）、`CHANGELOG.md` 未发布段、`test/http.test.ts` 注释里的 `shouldProxy` → `shouldProxyTunnel`
  - 验收：四条隐式契约有可复跑断言（`badPortsSet` 的内部路径、http 目标经代理走 absolute-form 且不建 CONNECT、压缩响应自动解压、网络错误 cause 链带底层 code）；升级后全套仍绿；`http:` 目标转发形态的文档口径从「undici 的默认」改成「8.12.3 实测」，并写明 8.7.0 改过这段
  - 验收证据：`pnpm test` 36 files / 307 tests；`pnpm lint` 与 `pnpm typecheck` 零诊断
  - 前置：无
  - 来源：依赖审查——8.7.0 的 `fix: auto-detect HTTP proxy tunneling` 换掉了 http 目标的转发路径，随后在 `ProxyAgent` + http 目标的连接回收上崩（undici#5529）；本仓库的代理形态、`redirect: "manual"`、错误 cause 链、`badPortsSet` 深 import 都压在同一批默认行为上
  - 进度：随 T27–T30 一起发布（0.8.3）；跑 `pnpm lint`（85 files 零诊断）、`pnpm typecheck`、`pnpm test`（37 files / 311 tests）全绿。审计按用户确认跳过

- [x] T27 仓库守卫：发布物 + 依赖方向
  - 交付物：`test/package.test.ts`、`scripts/check-imports.mjs`、`package.json`（`check:imports`）、`ci.yml`、`npm-publish.yml`、`.githooks/pre-commit`
  - 验收：新增顶层模块目录却漏写 `files` 时 `pnpm test` 红；`providers/` 导入 `tools/`、`tools/` 导入 `undici`、`index.ts` 值导入宿主包，三者都让 `pnpm check:imports` 退出码 1；正常代码输出 `ok: 39 files`
  - 验收证据：本会话 `node scripts/check-imports.mjs` 输出 `ok: 39 files`；仓库副本注入上述两处违规后输出两条失败并退出码 1；`pnpm test` 含 `test/package.test.ts` 全绿
  - 前置：无
  - 来源：审计——`files` 是枚举式清单（新模块静默漏发），`ARCHITECTURE.md` §2 的六条边与四处单一出口无执行器
  - 进度：已发布（0.8.3）；`.githooks/pre-commit` 跑 lint / check:imports / typecheck / test 四条，约 10 秒

- [x] T28 默认值收成单一来源（指针化）
  - 交付物：`docs/modules/config.md`（删默认值列，保留 clamp / 枚举）、`README.md` / `README.en.md`（默认值归属从 config.md 改成示例本身）
  - 验收：默认值只出现在 `config/schema.ts` 常量与根 README「完整示例」；跨文档只留指针，符合 `docs/ARCHITECTURE.md` §4
  - 验收证据：`docs/modules/config.md` 不列默认值；默认值只在 `config/schema.ts` 与根 README「完整示例」
  - 前置：无
  - 进度：已发布（0.8.3）；同时消掉 README 与 config.md 的互相指向

- [x] T29 真链路 e2e（opt-in）
  - 交付物：`test/e2e/live.test.ts`、`vitest.config.ts`、`vitest.e2e.config.ts`、`package.json`（`test:e2e`）、`docs/ARCHITECTURE.md` §3
  - 验收：`pnpm test` 不含 `test/e2e/`；`pnpm test:e2e` 在缺 key 时逐家 skip、有 key 时真打一次并断言结果形状；两者都不进 CI
  - 验收证据：本会话 `pnpm test:e2e` 1 file / 5 passed 5 skipped（tavily / exa / firecrawl 真打了上游）；`pnpm test` 37 files 不含 `test/e2e/`
  - 前置：无
  - 进度：已发布（0.8.3）

- [x] T30 CI 与供应链加固
  - 交付物：`ci.yml`、`npm-publish.yml`、`.github/workflows/dependency-audit.yml`、`package.json`（`lint` 加 `--error-on-warnings`）
  - 验收：显式 `--frozen-lockfile`、warning 即错、`timeout-minutes`、action 按 SHA、publish 前 tarball 覆盖全部 `files`、每日 `pnpm audit --prod`
  - 验收证据：本会话 `pnpm pack --dry-run --json` 实测 41 文件 / 覆盖 8 项 `files`；`pnpm lint` 零诊断
  - 前置：无
  - 进度：已发布（0.8.3）

## 已决（未成任务）

- `HttpError.status` / `.body` 是否删（本会话提出，全仓零生产读者、只有 `test/http.test.ts:129,133` 读）：决定**保留**——口径写进 `http/index.ts` 注释，将来要按状态码做事（如 429 退避）或把错误页正文给模型时直接用。注意 `body` 是整页、不截断。
- 16 张 provider / extractor 表是否抽象（审查 #5）：决定**不动**——认证头名、请求体字段、响应路径、错误约定各不相同，等第 9 家再加入口（用户已确认）。
