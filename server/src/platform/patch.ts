/**
 * The two merge rules every settings write repeats: a field the form left
 * blank is unset rather than written empty, and a secret the browser never saw
 * keeps its stored value. Both preserve unknown keys because they touch only the
 * key they are given.
 */

/** An empty string, list or plain object: what a blank form field arrives as. */
const isEmpty = (value: string | readonly unknown[] | {} | null): boolean => {
	if (value === "") return true;
	if (Array.isArray(value)) return value.length === 0;
	if (value === null || Object.getPrototypeOf(value) !== Object.prototype) return false;
	return Object.keys(value).length === 0;
};

/**
 * Write `value` at `key`, or remove the key when `value` is undefined, `""`, `{}`
 * or `[]`. `false` and `0` are values and are written.
 */
export const setOrDelete = <T, K extends keyof T>(
	target: T,
	key: K,
	value: T[K] | undefined,
): void => {
	if (value === undefined || isEmpty(value)) delete target[key];
	else target[key] = value;
};

/**
 * Write `value` at `key`, or remove the key only when `value` is undefined. For
 * a field where an empty string, list or object is a real answer, such as a
 * model's `input: []`.
 */
export const setDefined = <T, K extends keyof T>(
	target: T,
	key: K,
	value: T[K] | undefined,
): void => {
	if (value === undefined) delete target[key];
	else target[key] = value;
};

/**
 * What a blank value with no stored value means. An MCP form row is a promise of
 * a value, so it is refused; a provider header row is only dropped.
 */
export type MissingStored = "throw" | "drop";

/**
 * The browser only ever sees the names of stored secrets, so a blank value for a
 * stored name keeps the stored one. Names left out are removed. Returns
 * `undefined` for nothing, so the caller deletes the key.
 */
export const mergeSecrets = (
	incoming: Record<string, string> | undefined,
	stored: Record<string, string>,
	options: { onMissingStored: MissingStored },
): Record<string, string> | undefined => {
	if (incoming === undefined) return undefined;
	const merged: Record<string, string> = {};
	for (const [key, value] of Object.entries(incoming)) {
		const kept = stored[key];
		if (value !== "") merged[key] = value;
		else if (kept !== undefined) merged[key] = kept;
		else if (options.onMissingStored === "throw") {
			throw new Error(`Add a value for "${key}", or remove the row.`);
		}
	}
	return Object.keys(merged).length === 0 ? undefined : merged;
};
