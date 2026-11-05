/**
 * What `bun run parity` reads out of one file: the class tokens (layout, colour, motion)
 * and the words a user reads. The extraction is lexical, not a parse: a token that moved
 * into a shared component shows as missing, so pass that component's file too.
 */
/** The utility names Epsilon's classes start with, after any variants. */
const utility =
	/^(flex|grid|inline|block|hidden|contents|table|gap|space|divide|place|items|justify|content|self|order|col|row|basis|grow|shrink|p[xytrblse]?|m[xytrblse]?|w|h|size|min|max|inset|top|right|bottom|left|start|end|z|text|font|leading|tracking|whitespace|break|truncate|line-clamp|underline|italic|uppercase|lowercase|capitalize|tabular|bg|from|via|to|border|rounded|outline|ring|shadow|opacity|fill|stroke|object|aspect|overflow|overscroll|scroll|snap|relative|absolute|fixed|sticky|static|isolate|visible|invisible|sr-only|not-sr-only|cursor|select|pointer-events|resize|appearance|caret|accent|transition|duration|delay|ease|animate|enter|transform|translate|scale|rotate|skew|origin|will-change|backdrop|blur|filter|mix|decoration|list|field-sizing|group|peer|container|in|out|fade|zoom|slide|spin|sr|data|aria|has|not|first|last|dark|pad|scrollbar|prose)(-|$)/;

/** One Tailwind token: variants first, then a known utility, `!` and `-` allowed. */
const isClassToken = (token: string): boolean => {
	const base = token.replace(/^(?:[^:[\]]*(?:\[[^\]]*\])?[^:[\]]*:)*/, "").replace(/^!?-?/, "");
	return /^[\w:/.[\]()%#=,&>*'+-]+$/.test(token) && utility.test(base);
};

/** A literal reads as a class list when every token is a class token. */
const isClassList = (text: string): boolean => {
	const tokens = text.trim().split(/\s+/);
	return tokens.length > 0 && tokens[0] !== "" && tokens.every(isClassToken);
};

/** Words a user reads: letters, and either a space, a capital or end punctuation; no code. */
const isCopy = (text: string): boolean => {
	const trimmed = text.trim();
	return (
		/\p{L}/u.test(trimmed) &&
		(/\s/.test(trimmed) || /^\p{Lu}/u.test(trimmed) || /[.?!…]$/.test(trimmed)) &&
		!/[(){};=&|]|=>|\/\*|\*\//.test(trimmed) &&
		!/^[@#.]?\.?\//.test(trimmed)
	);
};

/**
 * The entities a JSX apostrophe or quote becomes: the branch writes `&apos;` because its
 * lint refuses a bare one, and parity compares the words a reader sees, not the source.
 */
const ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&apos;": "'",
	"&gt;": ">",
	"&lt;": "<",
	"&nbsp;": " ",
	"&quot;": '"',
	"&#39;": "'",
};

const decoded = (text: string): string =>
	text.replaceAll(/&(?:amp|apos|gt|lt|nbsp|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);

export type Surface = { classes: Set<string>; copy: Set<string> };

/**
 * The string and template literals in `source`, in order. The scan tracks template text and
 * its `${…}` substitutions, so a quote inside either cannot start a string and shift every
 * literal after it. A template with a substitution carries no copy: what a reader sees
 * depends on the value, which this tool does not run.
 */
const literalsOf = (source: string): string[] => {
	const found: string[] = [];
	let index = 0;
	while (index < source.length) {
		const char = source[index];
		if (char === '"') {
			const start = index + 1;
			index += 1;
			while (index < source.length && source[index] !== '"') {
				if (source[index] === "\\") index += 1;
				index += 1;
			}
			found.push(source.slice(start, index));
			index += 1;
			continue;
		}
		if (char === "`") {
			index += 1;
			let text = "";
			let substituted = false;
			while (index < source.length && source[index] !== "`") {
				if (source[index] === "\\") {
					text += source.slice(index, index + 2);
					index += 2;
					continue;
				}
				if (source[index] === "$" && source[index + 1] === "{") {
					substituted = true;
					index += 2;
					let depth = 1;
					while (index < source.length && depth > 0) {
						const next = source[index];
						if (next === "\\") {
							index += 2;
							continue;
						}
						if (next === "}") depth -= 1;
						else if (next === "{") depth += 1;
						else if (next === '"' || next === "'" || next === "`") {
							const close = next;
							index += 1;
							while (index < source.length && source[index] !== close) {
								if (source[index] === "\\") index += 1;
								index += 1;
							}
						}
						index += 1;
					}
					continue;
				}
				text += source[index];
				index += 1;
			}
			index += 1;
			if (!substituted) found.push(text);
			continue;
		}
		index += 1;
	}
	return found;
};

export const surfaceOf = (source: string): Surface => {
	const classes = new Set<string>();
	const copy = new Set<string>();
	const withoutImports = source
		.replaceAll(/^import[\s\S]*?from\s+"[^"]+";?$/gm, "")
		.replaceAll(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
	for (const text of literalsOf(withoutImports)) {
		if (isClassList(text)) for (const token of text.trim().split(/\s+/)) classes.add(token);
		else if (isCopy(text)) copy.add(text.trim());
	}
	for (const match of withoutImports.matchAll(/>([^<>{}]+)</g)) {
		const text = decoded((match[1] ?? "").replaceAll(/\s+/g, " ")).trim();
		if (text !== "" && isCopy(text)) copy.add(text);
	}
	return { classes, copy };
};

export const merge = (surfaces: readonly Surface[]): Surface => ({
	classes: new Set(surfaces.flatMap((surface) => [...surface.classes])),
	copy: new Set(surfaces.flatMap((surface) => [...surface.copy])),
});

export const missing = (from: Set<string>, into: Set<string>): string[] =>
	[...from].filter((entry) => !into.has(entry)).toSorted();
