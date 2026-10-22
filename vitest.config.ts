import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	// 真链路测试（test/e2e）需要 key 与外网，只由 `pnpm test:e2e` 拉起，默认套件不碰。
	test: { exclude: [...configDefaults.exclude, "test/e2e/**"] },
});
