/**
 * docs/ARCHITECTURE.md §2 的可执行版本：依赖方向边表 + 四处「单一出口」。
 * 规则改了先改 ARCHITECTURE.md，再改这里的 EDGES / SINGLE_IMPORT，两边不一致 CI 会红。
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** 允许的跨模块边：模块 -> 它可以直接 import 的模块（同模块内部不查）。 */
const EDGES = {
	".": ["config", "tools"],
	config: ["config"],
	ssrf: ["ssrf"],
	http: ["ssrf"],
	providers: ["config", "http", "providers"],
	extractors: ["config", "http", "extractors"],
	handlers: ["config", "handlers"],
	tools: ["config", "http", "ssrf", "providers", "extractors", "handlers", "tools"],
};

/** 只允许出现在指定位置的依赖；typeOnlyIn 里的文件必须写成 `import type`。 */
const SINGLE_IMPORT = [
	{ specifier: /^undici(\/|$)/, only: ["http/"] },
	{ specifier: /^node:child_process$/, only: ["handlers/github/"] },
	{
		specifier: /^@earendil-works\/pi-coding-agent$/,
		only: ["index.ts", "tools/result.ts"],
		typeOnlyIn: ["index.ts"],
	},
	{ specifier: /^@earendil-works\/pi-tui$/, only: ["tools/render.ts"] },
];

const SKIP_DIRS = new Set(["node_modules", "test", "scripts", "docs", "assets"]);

const files = [];
function walk(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) walk(path);
		else if (entry.name.endsWith(".ts")) files.push(relative(".", path).replaceAll("\\", "/"));
	}
}
walk(".");

/** 把相对导入按文件所在目录解析成仓库内 POSIX 路径，只用来判断归属模块。 */
function resolveSpec(file, spec) {
	const segments = [];
	for (const segment of `${file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ""}/${spec}`.split(
		"/",
	)) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") segments.pop();
		else segments.push(segment);
	}
	return segments.join("/");
}

const moduleOf = (path) => (path.includes("/") ? path.split("/")[0] : ".");

const failures = [];
for (const file of files.sort()) {
	const source = readFileSync(file, "utf-8");
	for (const [, typeOnly, spec] of source.matchAll(
		/^import\s+(type\s+)?(?:[\w*{}\s,$]+from\s+)?["']([^"']+)["']/gm,
	)) {
		for (const rule of SINGLE_IMPORT) {
			if (!rule.specifier.test(spec)) continue;
			if (!rule.only.some((allowed) => file === allowed || file.startsWith(allowed))) {
				failures.push(`${file}: ${spec} is only allowed in ${rule.only.join(", ")}`);
			} else if (typeOnly === undefined && rule.typeOnlyIn?.includes(file)) {
				failures.push(`${file}: ${spec} must be import type`);
			}
		}
		if (!spec.startsWith(".")) continue;
		const from = moduleOf(file);
		const to = moduleOf(resolveSpec(file, spec));
		if (to === from || EDGES[from]?.includes(to)) continue;
		failures.push(`${file}: depends on ${to}/ (not allowed from ${from}/)`);
	}
}

if (failures.length > 0) {
	console.error("Import graph violates docs/ARCHITECTURE.md §2:");
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}
console.log(`ok: ${files.length} files`);
