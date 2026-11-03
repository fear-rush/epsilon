/**
 * Adds a field only when it has a value.
 *
 * The wire and the settings shapes omit an unset key instead of writing `undefined`
 * (`exactOptionalPropertyTypes`), and a conditional object spread hides that omission in
 * a way the lint rules refuse. `target` is a fresh object at every call site.
 */
export const withDefined = <T extends object, K extends string, V>(
	target: T,
	key: K,
	value: V | undefined,
): T & { readonly [P in K]?: V } =>
	value === undefined ? target : Object.assign(target, { [key]: value });
