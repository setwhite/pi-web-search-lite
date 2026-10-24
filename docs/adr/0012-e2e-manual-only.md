# e2e 只在发版前手动跑，不进 CI

`test/e2e/live.test.ts` 打真实 provider 与 `https://example.com`，缺 key 的用例由 `it.skipIf` 跳过。`vitest.config.ts` 把它排除在 `pnpm test` 之外，只由 `pnpm test:e2e` 拉起；CI 与 pre-commit 都不跑。

理由：e2e 需要 8 家真实 key 与外网，结果受上游限流与改版影响；放进 CI 会让 PR 因外部原因变红。夹具钉请求形状（`test/providers/`、`test/extractors/`、`test/handlers/`），e2e 只回答「上游还认不认这条请求」。代价是上游悄悄改字段时，只有发版前那次手跑能发现。

不做的：nightly 定时 e2e、CI secrets 注入、录制回放（VCR）。理由：仓库要存 8 家 key 并维护轮换；回放会掩盖真实上游变化。
