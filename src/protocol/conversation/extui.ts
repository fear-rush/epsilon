import { Schema } from "effect";

/**
 * An extension's question, as it arrives at the page. pi's handlers answer with a
 * confirmation, one of several choices, or a line of text.
 */
export const DialogQuestion = Schema.Union([
	Schema.Struct({
		kind: Schema.Literals(["confirm"]),
		id: Schema.String,
		title: Schema.String,
		message: Schema.optional(Schema.String),
	}),
	Schema.Struct({
		kind: Schema.Literals(["select"]),
		id: Schema.String,
		title: Schema.String,
		message: Schema.optional(Schema.String),
		options: Schema.Array(Schema.String),
	}),
	Schema.Struct({
		kind: Schema.Literals(["input"]),
		id: Schema.String,
		title: Schema.String,
		message: Schema.optional(Schema.String),
		placeholder: Schema.optional(Schema.String),
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
]);

export type DialogAnswer = typeof DialogAnswer.Type;
