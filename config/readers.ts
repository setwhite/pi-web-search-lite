/**
 * 基础读取器：把 JSON 原始值转成目标类型。
 * - value 为 undefined 时静默回退默认值；
 * - 类型不符时向 errors 记一条 `<field path>: <reason>` 并回退。
 */

import type { Errors, Raw } from "./schema.ts";

export function asObject(value: unknown, path: string, errors: Errors): Raw | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		errors.push(`${path}: expected an object`);
		return undefined;
	}
	return value as Raw;
}

export function checkUnknownKeys(raw: Raw, allowed: readonly string[], path: string, errors: Errors): void {
	for (const key of Object.keys(raw)) {
		if (!allowed.includes(key)) errors.push(`${path === "" ? key : `${path}.${key}`}: unknown key`);
	}
}

export function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T, path: string, errors: Errors): T {
	if (value === undefined) return fallback;
	if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
	errors.push(`${path}: expected one of ${allowed.join(" / ")}, got ${JSON.stringify(value)}`);
	return fallback;
}

export function readBoolean(value: unknown, fallback: boolean, path: string, errors: Errors): boolean {
	if (value === undefined) return fallback;
	if (typeof value !== "boolean") {
		errors.push(`${path}: expected a boolean, got ${JSON.stringify(value)}`);
		return fallback;
	}
	return value;
}

export function optionalString(value: unknown, path: string, errors: Errors): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.trim() === "") {
		errors.push(`${path}: expected a non-empty string, got ${JSON.stringify(value)}`);
		return undefined;
	}
	return value;
}

export function readString(value: unknown, fallback: string, path: string, errors: Errors): string {
	return optionalString(value, path, errors) ?? fallback;
}

export function readStringArray(value: unknown, path: string, errors: Errors): string[] {
	if (!Array.isArray(value)) {
		errors.push(`${path}: expected an array of strings`);
		return [];
	}
	const items: string[] = [];
	for (const item of value) {
		const text = optionalString(item, path, errors);
		if (text !== undefined) items.push(text);
	}
	return items;
}

export function readNumber(
	value: unknown,
	fallback: number,
	path: string,
	errors: Errors,
	range: readonly [number, number],
): number {
	if (value === undefined) return clamp(fallback, range);
	if (typeof value !== "number" || !Number.isFinite(value)) {
		errors.push(`${path}: expected a number, got ${JSON.stringify(value)}`);
		return clamp(fallback, range);
	}
	return clamp(value, range);
}

export function readNullableNumber(value: unknown, path: string, errors: Errors, min: number): number | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		errors.push(`${path}: expected a number or null, got ${JSON.stringify(value)}`);
		return null;
	}
	return Math.max(min, Math.floor(value));
}

function clamp(value: number, range: readonly [number, number]): number {
	return Math.min(range[1], Math.max(range[0], value));
}
