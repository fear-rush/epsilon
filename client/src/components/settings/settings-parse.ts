/**
 * The `KEY=VALUE` encoding the headers form uses. Parsing lives here so a typo
 * produces a sentence instead of a silently dropped entry.
 */
export const parsePairs = (text: string) => {
	const pairs: [string, string][] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		const separator = trimmed.indexOf("=");
		if (separator <= 0) throw new Error(`Expected KEY=VALUE, got "${trimmed}"`);
		pairs.push([trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim()]);
	}
	return Object.fromEntries(pairs);
};
