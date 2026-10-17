# 配置非法即抛错，数值越界只 clamp

配置读 `<agent dir>/pi-web-search-lite/config.json`（`PI_CODING_AGENT_DIR` > `~/.pi/agent`），文件不存在即全默认；类型、枚举、未知键或工具名非法 → 启动抛错并指出字段路径，不做 salvage；数值越界不报错，clamp 到区间。API key 可走同名环境变量，优先于文件。

理由：配置面宽，静默丢掉写错的字段比启动失败更难排查；数值越界可以安全收敛到区间，不值得为它打断启动。

契约见 [../modules/config.md](../modules/config.md)。
