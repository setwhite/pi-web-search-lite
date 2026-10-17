# 代理只有一个配置点：config.proxy

搜索、抓取、provider 原生提取与 gh 子进程都经 `config.proxy`；不读 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`；本机目标（localhost / 回环）永远绕过代理；非 http(s) 代理在配置校验阶段报错。

理由：目标场景的 Clash / V2Ray 都提供 http 代理端口，一个键覆盖全部流量，可免去 curl 传输层与外部二进制依赖；环境变量代理在测试与子进程里容易出意外，显式配置让行为唯一。

契约见 [../modules/http.md](../modules/http.md)。
