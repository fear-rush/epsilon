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

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter() {
	highlighter ??= createHighlighterCore({
		themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
		langs: [],
		engine: createJavaScriptRegexEngine({ forgiving: true }),
	});

	return highlighter;
}

function getLanguage(language: string) {
	const name = language.toLowerCase();

	if (name === "ansi") {
		return name;
	}

	if (Object.hasOwn(languages, name)) {
		// SAFETY: Object.hasOwn checked that `name` is a key of `languages`.
		return name as keyof typeof languages;
	}

	if (Object.hasOwn(aliases, name)) {
		// SAFETY: Object.hasOwn checked that `name` is a key of `aliases`.
		return aliases[name as keyof typeof aliases];
	}

	return null;
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
			const tokenize = (text: string) =>
				shiki.codeToTokens(text, {
					lang,
					themes: { light: "github-light", dark: "github-dark" },
					defaultColor: false,
					grammarState: state,
				}).tokens;

			// ANSI has no grammar state, so each line is tokenized on its own and
			// gets the same colors whether it arrives in one piece or streams.
			const tokens =
				lang === "ansi" ? code.split("\n").flatMap((line) => tokenize(line)) : tokenize(code);

			return {
				lines: tokens.map((line) =>
					line.map((token, index) => (
						<span
							key={index}
							// SAFETY: shiki builds htmlStyle as camelCased CSS properties and
							// values for the token, so it satisfies React's style object.
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

		loadHighlighter(language)
			.then((next) => {
				if (!cancelled) {
					setLoaded({ language, highlighter: next });
				}
			})
			.catch(() => {});

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

	let next = done;

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
