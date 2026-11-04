import { Schema } from "effect";

import { DialogAnswer } from "./extui.ts";
import { ImageBlock } from "./frames.ts";
import { ThinkingLevel } from "./session.ts";

/**
 * What the page asks the engine to do. A command carries its own tag, so a result can
 * name the command that failed instead of guessing from order.
 */
const textCommand = (tag: "prompt" | "steer" | "followUp") =>
	Schema.Struct({
		t: Schema.Literals([tag]),
		text: Schema.String,
		images: Schema.optional(Schema.Array(ImageBlock)),
	});

export const Command = Schema.Union([
	textCommand("prompt"),
	textCommand("steer"),
	textCommand("followUp"),
	Schema.Struct({ t: Schema.Literals(["abort"]) }),
	Schema.Struct({ t: Schema.Literals(["answerDialog"]), answer: DialogAnswer }),
	/** Ask for the window before `before` (an entry id), for "load earlier messages". */
	Schema.Struct({ t: Schema.Literals(["loadHistory"]), before: Schema.String }),
	/** Ask for the flat branch tree; the answer is a `tree` frame to the asking tab. */
	Schema.Struct({ t: Schema.Literals(["loadTree"]) }),
	/** Move the leaf inside the same file; a user entry moves it to that entry's parent. */
	Schema.Struct({ t: Schema.Literals(["navigateTree"]), targetId: Schema.String }),
	/** Switch the model by pi's own provider and model ids. */
	Schema.Struct({
		t: Schema.Literals(["setModel"]),
		provider: Schema.String,
		modelId: Schema.String,
	}),
	Schema.Struct({ t: Schema.Literals(["setThinking"]), level: ThinkingLevel }),
	/** Declare exactly these tools to the model, by name; unknown names are ignored. */
	Schema.Struct({ t: Schema.Literals(["setTools"]), names: Schema.Array(Schema.String) }),
	/** pi's manual compaction; it aborts a running turn first. */
	Schema.Struct({ t: Schema.Literals(["compact"]) }),
	/** Re-open the runtime from the file after a foreign write. */
	Schema.Struct({ t: Schema.Literals(["reloadFromDisk"]) }),
]);
export type Command = typeof Command.Type;
