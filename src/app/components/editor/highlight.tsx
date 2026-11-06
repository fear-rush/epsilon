import * as React from "react";
import { createHighlighterCore, type GrammarState, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// Add the languages you need. Each one loads the first time it is used.
const languages = {
	bash: () => import("shiki/langs/shellscript.mjs"),
	css: () => import("shiki/langs/css.mjs"),
	diff: () => import("shiki/langs/diff.mjs"),
	html: () => import("shiki/langs/html.mjs"),
	javascript: () => import("shiki/langs/javascript.mjs"),
	json: () => import("shiki/langs/json.mjs"),
	jsx: () => import("shiki/langs/jsx.mjs"),
	markdown: () => import("shiki/langs/markdown.mjs"),
	python: () => import("shiki/langs/python.mjs"),
	sql: () => import("shiki/langs/sql.mjs"),
	tsx: () => import("shiki/langs/tsx.mjs"),
	typescript: () => import("shiki/langs/typescript.mjs"),
	yaml: () => import("shiki/langs/yaml.mjs"),
};

const aliases = {
	js: "javascript",
	md: "markdown",
	py: "python",
	sh: "bash",
	shell: "bash",
	shellscript: "bash",
	ts: "typescript",
	yml: "yaml",
	zsh: "bash",
} satisfies Record<string, keyof typeof languages>;

let highlighterPromise: Promise<HighlighterCore> | undefined;

function getHighlighter() {
	highlighterPromise ??= createHighlighterCore({
		themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
		langs: [],
		engine: createJavaScriptRegexEngine({ forgiving: true }),
	});

	return highlighterPromise;
}

function isLanguageName(name: string): name is keyof typeof languages {
	return Object.keys(languages).includes(name);
}

/** The language an alias points at, or none. Iterating avoids asserting an index. */
const aliasTarget = (name: string): keyof typeof languages | undefined =>
	Object.entries(aliases).find(([alias]) => alias === name)?.[1];

function getLanguage(language: string): keyof typeof languages | "ansi" | null {
	const name = language.toLowerCase();

	if (name === "ansi") {
		return name;
	}

	if (isLanguageName(name)) {
		return name;
	}

	return aliasTarget(name) ?? null;
}

// Loads a language and returns a highlighter for it, or null for a language
// that is not listed.
export async function loadHighlighter(language: string) {
	const lang = getLanguage(language);

	if (!lang) {
		return null;
	}

	const shiki = await getHighlighter();

	if (lang !== "ansi" && !shiki.getLoadedLanguages().includes(lang)) {
		await shiki.loadLanguage(languages[lang]);
	}

	return {
		// Returns one React node per line, and the grammar state after the last
		// line. Pass that state back to continue where the code left off.
		highlight(code: string, state?: GrammarState) {
			// Two calls, because a grammar state of `undefined` is not the same as none.
			const themes = { light: "github-light", dark: "github-dark" };
			const tokenize = (text: string) =>
				state === undefined
					? shiki.codeToTokens(text, { lang, themes, defaultColor: false }).tokens
					: shiki.codeToTokens(text, { lang, themes, defaultColor: false, grammarState: state })
							.tokens;

			// ANSI has no grammar state, so each line is tokenized on its own and
			// gets the same colors whether it arrives in one piece or streams.
			const tokens =
				lang === "ansi" ? code.split("\n").flatMap((line) => tokenize(line)) : tokenize(code);

			return {
				lines: tokens.map((line) =>
					line.map((token, index) => (
						<span
							// A token never reorders within its line; the index is its identity here.
							// oxlint-disable-next-line react/no-array-index-key -- a token never reorders within its line
							key={index}
							// SAFETY: shiki builds htmlStyle as camelCased CSS properties and
							// values for the token, so it satisfies React's style object.
							// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- shiki builds htmlStyle as camelCased CSS properties, which satisfy React's style object
							style={token.htmlStyle as React.CSSProperties}
							className="text-(--shiki-light) dark:text-(--shiki-dark)"
						>
							{token.content}
						</span>
					)),
				),
				state: shiki.getLastGrammarState(tokens),
			};
		},
	};
}

type Highlighter = NonNullable<Awaited<ReturnType<typeof loadHighlighter>>>;

/** One code block's tokens, kept so a remount does not highlight it again. */
type Highlighted = {
	readonly lines: React.ReactNode[];
	readonly state?: Parameters<Highlighter["highlight"]>[1];
	readonly text: string;
};

const CACHE_LIMIT = 50;
const cache = new Map<string, Highlighted>();

const cacheKey = (language: string, code: string): string => `${language}\u0000${code}`;

/** Oldest out first: a long chat must not keep every code block it ever showed. */
const remember = (key: string, value: Highlighted): void => {
	cache.delete(key);
	cache.set(key, value);
	if (cache.size <= CACHE_LIMIT) return;
	const oldest = cache.keys().next().value;
	if (oldest !== undefined) cache.delete(oldest);
};

export function useHighlightedCode(value: string, language: string) {
	// A trailing newline would render as an extra empty line.
	const code = value.endsWith("\n") ? value.slice(0, -1) : value;
	const [loaded, setLoaded] = React.useState<{
		language: string;
		highlighter: Awaited<ReturnType<typeof loadHighlighter>>;
	} | null>(null);
	const highlighter = loaded?.language === language ? loaded.highlighter : null;

	React.useEffect(() => {
		let cancelled = false;

		// A language that fails to load leaves the block as plain text.
		const load = async (): Promise<void> => {
			try {
				const next = await loadHighlighter(language);
				if (!cancelled) setLoaded({ language, highlighter: next });
			} catch {
				// Nothing to show for a failure; the caller renders the code unhighlighted.
			}
		};

		void load();

		return () => {
			cancelled = true;
		};
	}, [language]);

	// The complete lines, highlighted. While the code streams, only the new
	// lines are tokenized, starting from the grammar state of the last one.
	const [done, setDone] = React.useState<{
		highlighter: typeof highlighter;
		text: string;
		lines: React.ReactNode[];
		state?: Parameters<NonNullable<typeof highlighter>["highlight"]>[1];
	}>({ highlighter: null, text: "", lines: [] });

	const key = cacheKey(language, code);
	let next = done;

	// A block that was on screen before mounts with its tokens already built.
	const cached = cache.get(key);
	if (highlighter !== null && next.highlighter === null && cached !== undefined) {
		next = { highlighter, lines: cached.lines, state: cached.state, text: cached.text };
	}

	if (next.highlighter !== highlighter || !code.startsWith(next.text)) {
		next = { highlighter, text: "", lines: [] };
	}

	const end = code.lastIndexOf("\n") + 1;

	if (highlighter && end > next.text.length) {
		const result = highlighter.highlight(code.slice(next.text.length, end - 1), next.state);

		next = {
			highlighter,
			text: code.slice(0, end),
			lines: [...next.lines, ...result.lines],
			state: result.state,
		};
	}

	if (next !== done) {
		if (next.highlighter !== null && next.text !== "") {
			remember(key, { lines: next.lines, state: next.state, text: next.text });
		}
		setDone(next);
	}

	// The last line is still being written, so it is tokenized on every render.
	const tail = code.slice(end);

	return React.useMemo(() => {
		if (!highlighter) {
			return code.split("\n");
		}

		return [...next.lines, highlighter.highlight(tail, next.state).lines[0]];
	}, [code, highlighter, next, tail]);
}
