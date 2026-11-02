/**
 * What an extension's autocomplete providers suggest for a draft. The browser's own
 * palette answers `/` commands, so the chain starts from a base that answers nothing
 * and each registered factory wraps it, the way pi's editor builds its own.
 */
import type { AutocompleteProviderFactory } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { autocompleteItemSchema } from "shared";
import type { AutocompleteItem, AutocompleteReply, Command } from "shared";

import type { CommandTarget } from "./context";

/** How many suggestions one reply carries, so a provider cannot fill the palette. */
const SUGGESTION_LIMIT = 20;

/** How long a provider may take before its answer is dropped. */
const SUGGESTION_TIMEOUT_MS = 2_000;

type Provider = ReturnType<AutocompleteProviderFactory>;

/**
 * What a factory wraps. pi's base suggests its own command list and files; Epsilon's
 * command list lives in the browser palette, which already handles `/`, so this base
 * inherits nothing and a factory that delegates to `current` simply gets no answer.
 */
const BASE_PROVIDER: Provider = {
	getSuggestions: async () => null,
	applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol }),
};

/** A provider's answer as it arrives from an extension: third-party, so it is checked. */
const suggestionReplySchema = z.object({
	prefix: z.string(),
	items: z.array(autocompleteItemSchema),
});

/** The draft's lines and the cursor's place in them, which is what a provider reads. */
const placeCursor = (text: string, cursor: number) => {
	const offset = Math.max(0, Math.min(cursor, text.length));
	const before = text.slice(0, offset);
	return {
		lines: text.split("\n"),
		cursorLine: before.split("\n").length - 1,
		cursorCol: before.length - before.lastIndexOf("\n") - 1,
	};
};

/** The answer with pi's duplicates dropped and its length capped. */
const limited = (reply: z.infer<typeof suggestionReplySchema>, text: string): AutocompleteReply => {
	const seen = new Set<string>();
	const items: AutocompleteItem[] = [];
	for (const item of reply.items) {
		if (seen.has(item.value)) continue;
		seen.add(item.value);
		items.push(item);
		if (items.length === SUGGESTION_LIMIT) break;
	}
	return { text, prefix: reply.prefix, items };
};

const nothing = (text: string): AutocompleteReply => ({ text, prefix: "", items: [] });

/**
 * Ask the chain. A provider that throws, answers nonsense or never answers leaves the
 * palette empty: a keystroke must not cost a notice, and `dispatching` must not stay
 * set on a promise that will never settle.
 */
export const suggestionsFor = async (
	factories: readonly AutocompleteProviderFactory[],
	draft: { text: string; cursor: number },
): Promise<AutocompleteReply> => {
	if (factories.length === 0) return nothing(draft.text);
	const provider = factories.reduce<Provider>((current, wrap) => wrap(current), BASE_PROVIDER);
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expired = new Promise<null>((resolve) => {
		timer = setTimeout(() => {
			controller.abort();
			resolve(null);
		}, SUGGESTION_TIMEOUT_MS);
	});
	const { lines, cursorLine, cursorCol } = placeCursor(draft.text, draft.cursor);
	try {
		const answer = await Promise.race([
			provider.getSuggestions(lines, cursorLine, cursorCol, { signal: controller.signal }),
			expired,
		]);
		const parsed = suggestionReplySchema.safeParse(answer);
		return parsed.success ? limited(parsed.data, draft.text) : nothing(draft.text);
	} finally {
		clearTimeout(timer);
	}
};

/** One tab asked for suggestions; the session answers with the chain's reply. */
export const runAutocomplete = async (
	target: CommandTarget,
	command: Extract<Command, { type: "autocomplete" }>,
): Promise<void> => {
	target.returnAutocomplete(await target.suggestions(command.text, command.cursor));
};
