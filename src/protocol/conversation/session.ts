import { Schema } from "effect";

/**
 * The session's own knobs: which model answers, how hard it thinks, which tools it may
 * call. pi owns every one of them; these schemas only name what crosses the socket.
 */

/** pi's thinking levels, exactly as `ThinkingLevel` names them. */
export const ThinkingLevel = Schema.Literals([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);
export type ThinkingLevel = typeof ThinkingLevel.Type;

/** One model the engine can switch to; the picker lists what the runtime composed. */
export const ModelOption = Schema.Struct({
	provider: Schema.String,
	id: Schema.String,
	name: Schema.String,
});
export type ModelOption = typeof ModelOption.Type;
export const ModelOptions = Schema.Array(ModelOption);

/** One tool the session knows, and whether it is declared to the model now. */
export const ToolOption = Schema.Struct({
	name: Schema.String,
	description: Schema.String,
});
export type ToolOption = typeof ToolOption.Type;

export const ToolsView = Schema.Struct({
	active: Schema.Array(Schema.String),
	all: Schema.Array(ToolOption),
});
export type ToolsView = typeof ToolsView.Type;
