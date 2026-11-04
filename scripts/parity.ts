/**
 * Compares one of main's client files with the branch file(s) that port it, so "1:1"
 * is a check instead of a promise (docs/plan/03-port.md). It reads two things out of string
 * literals and JSX text: the class tokens (layout, colour, motion) and the words a user
 * reads. Anything main has that the port lacks is printed, and the run fails.
 *
 * bun run parity <main path> <branch path> [<branch path>...]
 * bun run parity client/src/features/conversation/fork-dialog.tsx src/app/features/conversation/dialogs.tsx
 *
 * The extraction is lexical, not a parse: a token that moved into a shared component
 * shows as missing. Then pass that component's file as another branch path.
 */
import { readFileSync } from "node:fs";

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

type Surface = { classes: Set<string>; copy: Set<string> };

const read = (source: string): Surface => {
	const classes = new Set<string>();
	const copy = new Set<string>();
	const withoutImports = source
		.replaceAll(/^import[\s\S]*?from\s+"[^"]+";?$/gm, "")
		.replaceAll(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
	// Oxfmt writes double quotes, so a single quote is an apostrophe in copy, not a string.
	const literals = withoutImports.matchAll(/"((?:[^"\\\n]|\\.)*)"|`([^`$]*)`/g);
	for (const match of literals) {
		const text = match[1] ?? match[2] ?? "";
		if (isClassList(text)) for (const token of text.trim().split(/\s+/)) classes.add(token);
		else if (isCopy(text)) copy.add(text.trim());
	}
	for (const match of withoutImports.matchAll(/>([^<>{}]+)</g)) {
		const text = decoded((match[1] ?? "").replaceAll(/\s+/g, " ")).trim();
		if (text !== "" && isCopy(text)) copy.add(text);
	}
	return { classes, copy };
};

const merge = (surfaces: readonly Surface[]): Surface => ({
	classes: new Set(surfaces.flatMap((surface) => [...surface.classes])),
	copy: new Set(surfaces.flatMap((surface) => [...surface.copy])),
});

const missing = (from: Set<string>, into: Set<string>): string[] =>
	[...from].filter((entry) => !into.has(entry)).toSorted();

const [mainPath, ...branchPaths] = process.argv.slice(2);
if (mainPath === undefined || branchPaths.length === 0) {
	console.error("usage: bun run parity <main path> <branch path> [<branch path>...]");
	process.exit(2);
}

const shown = Bun.spawnSync(["git", "show", `main:${mainPath}`]);
if (shown.exitCode !== 0) {
	console.error(`git show main:${mainPath} failed: ${shown.stderr.toString().trim()}`);
	process.exit(2);
}
const main = read(shown.stdout.toString());
const branch = merge(branchPaths.map((path) => read(readFileSync(path, "utf8"))));

const report = [
	{
		label: "class tokens main has and the port lacks",
		entries: missing(main.classes, branch.classes),
	},
	{ label: "copy main has and the port lacks", entries: missing(main.copy, branch.copy) },
	{
		label: "class tokens only the port has (check each)",
		entries: missing(branch.classes, main.classes),
	},
	{ label: "copy only the port has (check each)", entries: missing(branch.copy, main.copy) },
];
for (const { label, entries } of report) {
	if (entries.length === 0) continue;
	console.log(`\n${label} (${entries.length}):`);
	for (const entry of entries) console.log(`  ${entry}`);
}

const lost = (report[0]?.entries.length ?? 0) + (report[1]?.entries.length ?? 0);
console.log(lost === 0 ? "\nparity: nothing of main's is missing" : `\nparity: ${lost} missing`);
process.exit(lost === 0 ? 0 : 1);
