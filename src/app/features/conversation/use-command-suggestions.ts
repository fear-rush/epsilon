import { useEffect, useState } from "react";
import type { RefObject } from "react";

import type { AutocompleteReply, CommandOffer } from "#protocol/conversation/palette";

import type { PaletteEntry } from "./composer/palette";

/**
 * What follows `/` while the draft is still a bare command. A space ends it: from then on
 * the text is an argument to the command that was picked.
 */
const commandQuery = (draft: string): string | undefined => {
	const trimmed = draft.trimStart();
	if (!trimmed.startsWith("/")) return undefined;
	const query = trimmed.slice(1);
	return query.includes(" ") ? undefined : query;
};

/**
 * How long the composer waits after a keystroke before asking an extension's autocomplete
 * providers, so typing does not send a query per key.
 */
const SUGGESTION_DELAY_MS = 150;

/**
 * What the palette offers for the draft: the built-in commands that match a bare `/query`,
 * and an extension's autocomplete answer for the same text.
 */
export function useCommandSuggestions({
	text,
	commands,
	onSuggest,
	textareaRef,
}: {
	text: string;
	commands: ReadonlyArray<CommandOffer>;
	onSuggest: (text: string, cursor: number) => Promise<AutocompleteReply>;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
}): PaletteEntry[] {
	const [suggestions, setSuggestions] = useState<AutocompleteReply | undefined>(undefined);

	// An extension's providers see the draft after a pause, with the caret, the way its
	// `getEditorText` sees it. An empty draft asks nothing.
	useEffect(() => {
		const timer =
			text.trim() === ""
				? undefined
				: setTimeout(() => {
						const cursor = textareaRef.current?.selectionStart ?? text.length;
						void onSuggest(text, cursor).then(setSuggestions, () => setSuggestions(undefined));
					}, SUGGESTION_DELAY_MS);
		return () => {
			if (timer !== undefined) clearTimeout(timer);
		};
	}, [text, onSuggest, textareaRef]);

	const query = commandQuery(text);
	const commandMatches =
		query === undefined
			? []
			: commands.filter((command) => command.name.toLowerCase().includes(query.toLowerCase()));
	// A reply names the draft it answered, so one that arrived after the operator typed
	// on is not drawn.
	const answered = suggestions?.text === text ? suggestions : undefined;
	const entries: PaletteEntry[] = [
		...commandMatches.map<PaletteEntry>((command) => ({
			kind: "command",
			key: `command:${command.name}`,
			command,
		})),
		...(answered?.items ?? []).map<PaletteEntry>((item) => ({
			kind: "suggestion",
			key: `suggestion:${item.value}`,
			item,
			prefix: answered?.prefix ?? "",
		})),
	];

	return entries;
}
