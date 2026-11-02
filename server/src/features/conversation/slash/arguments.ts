/**
 * The argument shapes pi's built-in commands take. One value each, so the parsing
 * lives in one place instead of inside the handler that happens to need it.
 */

/** Everything after the name, trimmed; undefined when the command took nothing. */
export const textArgument = (argument: string): string | undefined => {
	const text = argument.trim();
	return text === "" ? undefined : text;
};

/**
 * pi's path argument: one shell word, with a matching pair of quotes allowed around
 * it. A path with a space is quoted the way the terminal takes it, because the
 * composer sends the line as typed.
 */
export const pathArgument = (argument: string): string | undefined => {
	const text = argument.trim();
	if (text === "") return undefined;
	const first = text[0];
	if (first === '"' || first === "'") {
		const closing = text.indexOf(first, 1);
		return closing < 0 ? undefined : text.slice(1, closing);
	}
	const space = text.search(/\s/);
	return space < 0 ? text : text.slice(0, space);
};
