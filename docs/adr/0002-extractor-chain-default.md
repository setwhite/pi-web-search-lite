# 抓取走提取器链，默认 html → jina

`web_fetch` 按 `fetch.extractors` 顺序逐个尝试：缺 key 的提取器跳过（不发请求），报错或正文短于 `fetch.minChars` 记原因顺延，全败抛错并逐条列出原因；`raw: true` 跳过整链。

理由：默认两位都不需要 key、不额外计费，装完即能抓；链式顺延让单个提取器故障不至于让抓取整体失败。provider 提取器要显式加进链，不默认启用，避免未配置的源被静默使用。

契约见 [../modules/extractors.md](../modules/extractors.md)。
