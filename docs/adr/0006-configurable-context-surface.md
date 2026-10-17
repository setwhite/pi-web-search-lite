# 影响上下文的开关全部可配，deferred 复用宿主 tool_search

`tools.*`（开关与改名）、`activation`、`guidance.*`、截断上限与默认结果数都进配置；`deferred` 模式下只把宿主内置 `tool_search` 加进激活集，宿主没提供就在 `session_start` 直接激活自身工具并告警。

理由：常驻上下文的大小不该由扩展替用户决定；deferred 复用宿主能力，省掉自建 loader、checkpoint 判定与 core/host 分层。
