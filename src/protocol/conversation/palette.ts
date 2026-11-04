import { Schema } from "effect";

/**
 * What `/` offers, and what an extension's autocomplete provider suggests for a draft.
 * Both feed one list in the composer, so they share one module.
 */

/** Who answers a command: the table, an extension, a prompt template or a skill. */
export const CommandSource = Schema.Literals(["builtin", "extension", "prompt", "skill"]);
export type CommandSource = typeof CommandSource.Type;

/** One entry of the palette: something a `/name` expands, or a command answered here. */
export const CommandOffer = Schema.Struct({
	name: Schema.String,
	description: Schema.optional(Schema.String),
	/** What the name takes, in pi's own bracket notation: `<provider/model>`. */
	argumentHint: Schema.optional(Schema.String),
	source: CommandSource,
});
export type CommandOffer = typeof CommandOffer.Type;

/** One suggestion a provider offers: pi's own `AutocompleteItem` shape. */
export const AutocompleteItem = Schema.Struct({
	/** What picking it inserts. */
	value: Schema.String,
	label: Schema.String,
	description: Schema.optional(Schema.String),
});
export type AutocompleteItem = typeof AutocompleteItem.Type;

/**
 * A provider's answer, echoed with the draft it was asked for: a tab drops a reply that
 * arrives after the operator typed on. `prefix` is the text before the cursor that the
 * provider matched, so picking an item replaces exactly that.
 */
export const AutocompleteReply = Schema.Struct({
	text: Schema.String,
	prefix: Schema.String,
	items: Schema.Array(AutocompleteItem),
});
export type AutocompleteReply = typeof AutocompleteReply.Type;
