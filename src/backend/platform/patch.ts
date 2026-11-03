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

/** True for any value JSON can hold, at any depth. The platform's JSON boundary. */
export const isJsonValue = (value: unknown): value is JsonValue => {
	if (value === null) return true;
	if (typeof value === "string" || typeof value === "boolean") return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (Array.isArray(value)) return value.every(isJsonValue);
	if (!isJsonObject(value)) return false;
	return Object.values(value).every(isJsonValue);
};

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

/** An empty string, list or plain object: what a blank form field arrives as. */
const isEmpty = (value: JsonValue): boolean => {
	if (value === "") return true;
	if (Array.isArray(value)) return value.length === 0;
	if (value === null || !isJsonObject(value)) return false;
	return Object.keys(value).length === 0;
};

/**
 * Write `value` at `key`, or remove the key when it is undefined, `""`, `{}` or `[]`.
 * `false` and `0` are values and are written. The object is the caller's local copy.
 */
export const setOrDelete = (
	target: JsonObject,
	key: string,
	value: JsonValue | undefined,
): void => {
	if (value === undefined || isEmpty(value)) delete target[key];
	else target[key] = value;
};

/**
 * Write `value` at `key`, or remove the key only when it is undefined. For a field where
 * an empty string, list or object is a real answer.
 */
export const setDefined = (target: JsonObject, key: string, value: JsonValue | undefined): void => {
	if (value === undefined) delete target[key];
	else target[key] = value;
};
