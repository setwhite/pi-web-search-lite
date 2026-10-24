# GitHub 页面交给 gh 直接取正文

`web_fetch` 第 0 步跑 handler：命中 github.com 的仓库 / blob / tree / issue / PR / release 六类 URL 时调 `gh` 取数据并渲染成 markdown；未命中、`gh` 缺失、未登录或失败都返回 skipped，透明顺延到提取器链。

理由：gh 直接取数就能产出清洗后的正文（仓库页两条命令：元数据 + README），省掉 clone 生命周期与磁盘缓存；gist / wiki / discussions / actions 这些零碎形态不做专用处理，顺延给提取器链即可。

不做的：GitHub clone、磁盘缓存、整仓 tree 展开。契约见 `handlers/` 与 `test/handlers/`。
