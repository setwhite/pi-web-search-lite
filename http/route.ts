/**
 * 代理可用性状态：连续传输层失败达阈值后进入冷却，冷却期内只直连，到期后放行一次探测。
 *
 * `createHttpClient` 每次工具调用都新建，计数放在 client 里永远到不了阈值，所以状态按进程共享；
 * 代理配置变了（/reload 改了 config.proxy）就重置。`now` 由调用方传入，只为测试能跨过冷却窗口。
 */

export const PROXY_FAILURE_THRESHOLD = 3;
export const PROXY_COOLDOWN_MS = 60_000;

interface RouteState {
	key: string;
	failures: number;
	cooldownUntil: number;
	lastFailure: string;
}

let state: RouteState | undefined;

/** 取当前代理的状态；未配代理或代理变了就重置。 */
function stateFor(proxy: string | undefined): RouteState | undefined {
	if (proxy === undefined || proxy === "") {
		state = undefined;
		return undefined;
	}
	if (state === undefined || state.key !== proxy) {
		state = { key: proxy, failures: 0, cooldownUntil: 0, lastFailure: "" };
	}
	return state;
}

/** 本次请求是否该走代理：失败达阈值后只在冷却到期时放行一次探测。 */
export function useProxy(proxy: string | undefined, now: number): boolean {
	const route = stateFor(proxy);
	if (route === undefined) return false;
	if (route.failures < PROXY_FAILURE_THRESHOLD) return true;
	return now >= route.cooldownUntil;
}

export function recordProxySuccess(proxy: string | undefined): void {
	const route = stateFor(proxy);
	if (route === undefined) return;
	route.failures = 0;
	route.cooldownUntil = 0;
	route.lastFailure = "";
}

/** `reason` 取错误的 type（network / timeout），只用于提示里的病因，不做判定。 */
export function recordProxyFailure(proxy: string | undefined, reason: string, now: number): void {
	const route = stateFor(proxy);
	if (route === undefined) return;
	route.failures += 1;
	route.lastFailure = reason;
	if (route.failures >= PROXY_FAILURE_THRESHOLD) route.cooldownUntil = now + PROXY_COOLDOWN_MS;
}

/** 降级提示（不带引用前缀，英文单行）；代理未配置或正常时为 null。 */
export function proxyNotice(proxy: string | undefined): string | null {
	const route = stateFor(proxy);
	if (route === undefined || route.failures === 0) return null;
	const summary = `${route.failures} proxy attempt${route.failures === 1 ? "" : "s"} failed in a row (last: ${route.lastFailure})`;
	if (route.failures < PROXY_FAILURE_THRESHOLD) return `${summary}; using a direct connection.`;
	return `${summary}; direct connections only, proxy retried every ${PROXY_COOLDOWN_MS / 1000}s.`;
}

/** 清空状态；仅测试用。 */
export function resetProxyRoute(): void {
	state = undefined;
}
