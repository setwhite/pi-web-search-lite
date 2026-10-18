/**
 * undici 没把内部模块写进 `types/`，但它自己的 fetch 就用这份名单拦下「bad port」：名单内的端口当场拒发，连接都不建。
 * 声明写成「取名字 + 定类型」，undici 去掉该导出时 `tsc` 会当场报错，不会静默退化。
 */
declare module "undici/lib/web/fetch/constants.js" {
	/** https://fetch.spec.whatwg.org/#block-bad-port */
	export const badPortsSet: Set<string>;
}
