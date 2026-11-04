import type { AutocompleteProviderFactory } from "@earendil-works/pi-coding-agent";
import { Effect, Option, Schema } from "effect";

import { AutocompleteItem } from "#protocol/conversation/palette";
import type { AutocompleteReply } from "#protocol/conversation/palette";

/**
 * What an extension's autocomplete providers suggest for a draft.
 *
 * The browser's own palette answers `/` commands, so the chain starts from a base that
 * answers nothing and each registered factory wraps it, the way pi's editor builds its
 * own. A provider is third-party code: its answer is checked, its length is capped, and a
 * provider that throws, answers nonsense or never settles leaves the palette empty rather
 * than failing a keystroke or hanging the engine.
 */

type Provider = ReturnType<AutocompleteProviderFactory>;

/** How many suggestions one reply carries, so a provider cannot fill the palette. */
const SUGGESTION_LIMIT = 20;

/** How long a provider may take before its answer is dropped. */
const SUGGESTION_TIMEOUT = "2 seconds";

/**
 * What a factory wraps. pi's base suggests its own command list and files, which the
 * browser's palette already handles, so this base inherits nothing.
 */
const BASE_PROVIDER: Provider = {
	applyCompletion: (lines, cursorLine, cursorCol) => ({ cursorCol, cursorLine, lines }),
	getSuggestions: () => Promise.resolve(null),
};

/** A provider's answer as it arrives from an extension, so it is decoded, not trusted. */
const ProviderAnswer = Schema.Struct({
	items: Schema.Array(AutocompleteItem),
	prefix: Schema.String,
});

type ProviderAnswer = typeof ProviderAnswer.Type;

/** The draft's lines and the cursor's place in them, which is what a provider reads. */
const placeCursor = (text: string, cursor: number) => {
	const offset = Math.max(0, Math.min(cursor, text.length));
	const before = text.slice(0, offset);
	return {
		cursorCol: before.length - before.lastIndexOf("\n") - 1,
		cursorLine: before.split("\n").length - 1,
		lines: text.split("\n"),
	};
};

const nothing = (text: string): AutocompleteReply => ({ items: [], prefix: "", text });

/** The answer with pi's duplicates dropped and its length capped. */
const limited = (reply: ProviderAnswer, text: string): AutocompleteReply => {
	const seen = new Set<string>();
	const items: AutocompleteItem[] = [];
	for (const item of reply.items) {
		if (seen.has(item.value)) continue;
		seen.add(item.value);
		items.push(item);
		if (items.length === SUGGESTION_LIMIT) break;
	}
	return { items, prefix: reply.prefix, text };
};

export const suggestionsFor = (
	factories: ReadonlyArray<AutocompleteProviderFactory>,
	draft: { readonly text: string; readonly cursor: number },
): Effect.Effect<AutocompleteReply> =>
	Effect.gen(function* () {
		if (factories.length === 0) return nothing(draft.text);
		const provider = factories.reduce<Provider>((current, wrap) => wrap(current), BASE_PROVIDER);
		const { cursorCol, cursorLine, lines } = placeCursor(draft.text, draft.cursor);
		// The signal aborts the provider when the timeout interrupts this effect.
		const answer = yield* Effect.tryPromise({
			catch: () => undefined,
			try: (signal) => provider.getSuggestions(lines, cursorLine, cursorCol, { signal }),
		}).pipe(Effect.timeout(SUGGESTION_TIMEOUT), Effect.option);
		if (Option.isNone(answer) || answer.value === null) return nothing(draft.text);
		const parsed = Schema.decodeOption(ProviderAnswer)(answer.value);
		if (Option.isNone(parsed)) return nothing(draft.text);
		return limited(parsed.value, draft.text);
	});
