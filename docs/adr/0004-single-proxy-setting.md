# 代理只有一个配置点：config.proxy

搜索、抓取与 provider 原生提取都经 `config.proxy`，不读 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`；`config.proxy` 非空时也注入 gh 子进程的 `HTTP(S)_PROXY`，为空时 gh 继承宿主环境（宿主已有的代理变量仍可能生效）。本机目标（localhost / 回环）永远绕过代理；非 http(s) 代理在配置校验阶段报错。

理由：目标场景的 Clash / V2Ray 都提供 http 代理端口，一个键覆盖扩展自身的全部流量，可免去 curl 传输层与外部二进制依赖；环境变量代理在测试与子进程里容易出意外，所以扩展自身不读它，只在 gh 子进程上做显式注入。

契约见 `http/index.ts` 与 `test/http.test.ts`。
