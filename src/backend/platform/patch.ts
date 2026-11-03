/**
 * The merge Epsilon performs on pi's own JSON files.
 *
 * Epsilon writes only the keys it owns and must keep every key it does not understand,
 * including ones a newer pi added. So: objects merge field by field, arrays and scalars
 * replace, and nothing else is invented.
 *
 * This file and `json-document.ts` are the JSON boundary: a document really is a tree of
 * untyped values, so the runtime guards below are the contract rather than a shortcut.
 */

export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

/** True for a JSON object and nothing else: not an array, not null. */
export const isJsonObject = (value: unknown): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isObject = isJsonObject;

/** Merges `patch` into `base`, keeping keys only `base` had. Arrays and scalars replace. */
export function mergeDeep(base: JsonObject, patch: JsonObject): JsonObject {
	const merged = { ...base };
	for (const [key, value] of Object.entries(patch)) {
		const current = merged[key];
		merged[key] =
			current !== undefined && isObject(current) && isObject(value)
				? mergeDeep(current, value)
				: value;
	}
	return merged;
}

/** The same object with one key removed, without mutating the input. */
export function withoutKey(value: JsonObject, key: string): JsonObject {
	const { [key]: _removed, ...rest } = value;
	return rest;
}
