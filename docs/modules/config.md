# config/

配置文件的加载、校验与 clamp。只依赖 `node:` 标准库，不碰网络与宿主 API。

字段、默认值、clamp 区间、错误文本与 key 合并都在 `config/schema.ts`、`config/validate.ts` 与 `config/index.ts`；本文不复述，形状由 `test/config.test.ts` 钉住。

## 取舍

- 数值越界只 clamp，其余非法即抛错：理由见 [ADR-0005](../adr/0005-strict-config-validation.md)。
- 默认值的可读版本只在根 `README.md` 的「完整示例」；本文不列默认值，避免第三份副本。

## 指针

- 三道上限（`fetch.maxCharsPerPage` / `handlers.github.maxChars` / `context.*`）的适用对象：根 `README.md`「三道 max 闸」。
- agent dir 与配置文件路径：术语见 `docs/GLOSSARY.md`「agent dir」，实现见 `defaultConfigPath`。
