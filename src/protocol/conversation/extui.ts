import { Schema } from "effect";

/**
 * An extension's question, as it arrives at the page. pi's handlers answer with a
 * confirmation, one of several choices, a line of text, or a block of text.
 *
 * `deadlineAt` is the clock time the question closes at, so a tab that attaches late
 * counts down from pi's deadline instead of from its own arrival.
 */
export const DialogQuestion = Schema.Union([
	Schema.Struct({
		kind: Schema.Literals(["confirm"]),
		id: Schema.String,
		title: Schema.String,
		message: Schema.optional(Schema.String),
		deadlineAt: Schema.optional(Schema.Finite),
	}),
	Schema.Struct({
		kind: Schema.Literals(["select"]),
		id: Schema.String,
		title: Schema.String,
		message: Schema.optional(Schema.String),
		options: Schema.Array(Schema.String),
		deadlineAt: Schema.optional(Schema.Finite),
	}),
	Schema.Struct({
		kind: Schema.Literals(["input"]),
		id: Schema.String,
		title: Schema.String,
		message: Schema.optional(Schema.String),
		placeholder: Schema.optional(Schema.String),
		deadlineAt: Schema.optional(Schema.Finite),
	}),
	Schema.Struct({
		kind: Schema.Literals(["editor"]),
		id: Schema.String,
		title: Schema.String,
		message: Schema.optional(Schema.String),
		/** pi's `editor(title, prefill)`; the box opens with this text in it. */
		prefill: Schema.optional(Schema.String),
		deadlineAt: Schema.optional(Schema.Finite),
	}),
]);

export type DialogQuestion = typeof DialogQuestion.Type;

/** The answer the page sends back; the dialog is closed by its id, not by kind alone. */
export const DialogAnswer = Schema.Union([
	Schema.Struct({
		id: Schema.String,
		kind: Schema.Literals(["confirm"]),
		confirmed: Schema.Boolean,
	}),
	Schema.Struct({ id: Schema.String, kind: Schema.Literals(["select"]), index: Schema.Finite }),
	Schema.Struct({ id: Schema.String, kind: Schema.Literals(["input"]), text: Schema.String }),
	Schema.Struct({ id: Schema.String, kind: Schema.Literals(["editor"]), text: Schema.String }),
	/** A timeout, an abort or a closed engine. pi's default for the question kind. */
	Schema.Struct({ id: Schema.String, kind: Schema.Literals(["cancelled"]) }),
]);

export type DialogAnswer = typeof DialogAnswer.Type;

/**
 * One line an extension put in the status rail, keyed so a later update replaces it.
 * The rail is every extension's row except the permission mode's, which the composer's
 * own menu draws.
 */
export const UiStatus = Schema.Struct({
	key: Schema.String,
	text: Schema.String,
});
export type UiStatus = typeof UiStatus.Type;

/**
 * One block an extension put above or below the composer, as the text lines pi gave. A
 * component factory has no browser equivalent and is refused by the engine instead.
 */
export const UiWidget = Schema.Struct({
	key: Schema.String,
	placement: Schema.Literals(["aboveEditor", "belowEditor"]),
	lines: Schema.Array(Schema.String),
});
export type UiWidget = typeof UiWidget.Type;
