import { defineConfig } from "vitest/config";

export default defineConfig({
	test: { include: ["test/e2e/**/*.test.ts"], testTimeout: 60_000, fileParallelism: false },
});
