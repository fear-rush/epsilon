import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * The editor's look, written against the app's CSS variables only, so it follows
 * the light and dark tokens without a second palette.
 */

const theme = EditorView.theme({
	"&": {
		height: "100%",
		color: "var(--foreground)",
		backgroundColor: "transparent",
		fontSize: "0.8125rem",
	},
	"&.cm-focused": { outline: "none" },
	".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65", overflow: "auto" },
	".cm-content": { padding: "0.75rem 0", caretColor: "var(--foreground)" },
	".cm-line": { padding: "0 0.875rem" },
	".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
	"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
		{ backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)" },
	".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--muted) 55%, transparent)" },
	".cm-selectionMatch": { backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)" },
	".cm-placeholder": { color: "var(--muted-foreground)" },
	".cm-gutters": {
		backgroundColor: "transparent",
		color: "var(--muted-foreground)",
		border: "none",
		borderRight: "1px solid var(--border)",
		fontFamily: "var(--font-mono)",
		fontSize: "0.75rem",
	},
	".cm-lineNumbers .cm-gutterElement": { padding: "0 0.5rem 0 0.75rem", minWidth: "2.5rem" },
	".cm-activeLineGutter": {
		backgroundColor: "color-mix(in oklab, var(--muted) 55%, transparent)",
		color: "var(--foreground)",
	},
	".cm-foldGutter .cm-gutterElement": { padding: "0 0.25rem", cursor: "pointer" },
	".cm-lint-marker": { width: "0.75rem", height: "0.75rem" },
	".cm-diagnostic-error": { borderLeft: "3px solid var(--destructive)" },
	".cm-lintRange-error": {
		backgroundImage: "none",
		textDecoration: "underline wavy var(--destructive)",
		textUnderlineOffset: "3px",
	},
	// Search panel
	".cm-panels": {
		backgroundColor: "var(--popover)",
		color: "var(--popover-foreground)",
		borderColor: "var(--border)",
		fontFamily: "var(--font-sans)",
	},
	".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
	".cm-panel.cm-search": { padding: "0.5rem 2rem 0.5rem 0.75rem", fontSize: "0.75rem" },
	".cm-panel.cm-search input, .cm-panel.cm-search button": { fontSize: "0.75rem" },
	".cm-panel.cm-search .cm-textfield": {
		backgroundColor: "transparent",
		color: "var(--foreground)",
		border: "1px solid var(--input)",
		borderRadius: "var(--radius-md)",
		padding: "0.125rem 0.375rem",
	},
	".cm-panel.cm-search .cm-button": {
		backgroundImage: "none",
		backgroundColor: "var(--secondary)",
		color: "var(--secondary-foreground)",
		border: "1px solid var(--border)",
		borderRadius: "var(--radius-md)",
		padding: "0.125rem 0.5rem",
	},
	".cm-panel.cm-search label": { color: "var(--muted-foreground)" },
	".cm-searchMatch": {
		backgroundColor: "color-mix(in oklab, var(--warning) 30%, transparent)",
		outline: "none",
	},
	".cm-searchMatch.cm-searchMatch-selected": {
		backgroundColor: "color-mix(in oklab, var(--warning) 55%, transparent)",
	},
	// Diagnostics
	".cm-tooltip": {
		backgroundColor: "var(--popover)",
		color: "var(--popover-foreground)",
		border: "1px solid var(--border)",
		borderRadius: "var(--radius-md)",
		fontFamily: "var(--font-sans)",
	},
	".cm-diagnostic": { padding: "0.25rem 0.5rem", fontSize: "0.75rem" },
	".cm-diagnostic-warning": { borderLeft: "3px solid var(--warning)" },
	".cm-diagnostic-info": { borderLeft: "3px solid var(--muted-foreground)" },
	".cm-lintRange-warning": {
		backgroundImage: "none",
		textDecoration: "underline wavy var(--warning)",
		textUnderlineOffset: "3px",
	},
	".cm-lintRange-info": {
		backgroundImage: "none",
		textDecoration: "underline dotted var(--muted-foreground)",
		textUnderlineOffset: "3px",
	},
});

const highlight = HighlightStyle.define([
	{ tag: tags.heading, fontWeight: "600", color: "var(--foreground)" },
	{ tag: tags.strong, fontWeight: "700" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.strikethrough, textDecoration: "line-through" },
	{ tag: tags.link, color: "var(--muted-foreground)" },
	{ tag: tags.url, color: "var(--primary)", textDecoration: "underline" },
	{ tag: tags.monospace, color: "var(--muted-foreground)" },
	{ tag: tags.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
	{
		tag: [tags.processingInstruction, tags.contentSeparator, tags.meta],
		color: "var(--muted-foreground)",
	},
	{ tag: tags.comment, color: "var(--muted-foreground)" },
]);

export const editorTheme = [theme, syntaxHighlighting(highlight)];
