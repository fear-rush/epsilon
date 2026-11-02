/**
 * pi reads `models.json` with `stripJsonComments()` (`dist/utils/json.js`): `//`
 * line comments and trailing commas are tolerated, and string literals are left
 * alone. This reader does the same and, unlike pi, reports the first line that
 * carries one, so a writer can refuse to drop it instead of silently rewriting the
 * file. pi reads `settings.json` and `mcp.json` strictly; do not use this for them.
 */

export type LenientJson = {
	/** The text pi would parse, with comments and trailing commas removed. */
	text: string;
	/** The first line carrying a comment or a trailing comma, 1-based. */
	line?: number;
};

export const lenientJsonOf = (input: string): LenientJson => {
	let text = "";
	let line = 1;
	let first: number | undefined;
	let inString = false;
	let index = 0;
	while (index < input.length) {
		const char = input[index] ?? "";
		if (inString) {
			text += char;
			if (char === "\\") {
				// Copy the escaped character too, so `\"` does not close the string.
				index += 1;
				text += input[index] ?? "";
			} else if (char === '"') {
				inString = false;
			}
		} else if (char === '"') {
			inString = true;
			text += char;
		} else if (char === "/" && input[index + 1] === "/") {
			first ??= line;
			// Keep the newline, so every later line number stays right.
			while (index < input.length && input[index] !== "\n") index += 1;
			continue;
		} else if (char === ",") {
			let next = index + 1;
			while (next < input.length && /\s/u.test(input[next] ?? "")) next += 1;
			if (input[next] === "}" || input[next] === "]") {
				first ??= line;
				index += 1;
				continue;
			}
			text += char;
		} else {
			text += char;
			if (char === "\n") line += 1;
		}
		index += 1;
	}
	return { text, line: first };
};
