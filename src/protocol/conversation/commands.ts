import { Schema } from "effect";

import { DialogAnswer } from "./extui.ts";
import { ImageBlock } from "./frames.ts";
import { ThinkingLevel } from "./session.ts";

/** One prompt carries at most four images. */
export const PROMPT_IMAGE_MAX = 4;

/**
 * The raw bytes one image may hold: 2 MB. pi resizes the image it receives anyway, so
 * this is a memory bound, not a quality one.
 */
export const PROMPT_IMAGE_BYTES_MAX = 2 * 1024 * 1024;

/** Base64 characters for some raw bytes: `ceil(bytes / 3) * 4`. */
const base64Length = (bytes: number): number => Math.ceil(bytes / 3) * 4;

/** `PROMPT_IMAGE_BYTES_MAX` as base64, which is what `data` may hold. */
const PROMPT_IMAGE_BASE64_MAX = base64Length(PROMPT_IMAGE_BYTES_MAX);

/** Every image of one prompt together: 12,000,000 base64 characters. */
export const PROMPT_IMAGE_BASE64_TOTAL_MAX = 12_000_000;

/** The base64 length of every image together, which is what one command carries. */
export const promptImagesBase64Length = (images: ReadonlyArray<{ data: string }>): number =>
	images.reduce((total, image) => total + image.data.length, 0);

/**
 * The images one message may carry. The caps are checked here so a bug in the composer
 * cannot put a larger frame on the socket, and they are the same numbers the composer
 * refuses a file with.
 */
const PromptImages = Schema.Array(ImageBlock).pipe(
	Schema.check(Schema.isMaxLength(PROMPT_IMAGE_MAX)),
	Schema.check(
		Schema.makeFilter(
			(images: ReadonlyArray<ImageBlock>) =>
				images.every((image) => image.data.length <= PROMPT_IMAGE_BASE64_MAX),
			{ message: `One image is over the ${PROMPT_IMAGE_BASE64_MAX} base64 characters limit` },
		),
	),
	Schema.check(
		Schema.makeFilter(
			(images: ReadonlyArray<ImageBlock>) =>
				promptImagesBase64Length(images) <= PROMPT_IMAGE_BASE64_TOTAL_MAX,
			{ message: `Images together are over the ${PROMPT_IMAGE_BASE64_TOTAL_MAX} characters limit` },
		),
	),
);

/**
 * What the page asks the engine to do. A command carries its own tag, so a result can
 * name the command that failed instead of guessing from order.
 */
const textCommand = (tag: "prompt" | "steer" | "followUp") =>
	Schema.Struct({
		t: Schema.Literals([tag]),
		text: Schema.String,
		images: Schema.optional(PromptImages),
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
	/**
	 * Copy the branch into a new session file. `before` cuts at a user message and hands
	 * its text back; `at` clones up to the entry and includes it.
	 */
	Schema.Struct({
		t: Schema.Literals(["fork"]),
		entryId: Schema.String,
		position: Schema.optional(Schema.Literals(["before", "at"])),
	}),
	/** Re-open the runtime from the file after a foreign write. */
	Schema.Struct({ t: Schema.Literals(["reloadFromDisk"]) }),
	/** pi's automatic compaction, written through its own settings so a terminal agrees. */
	Schema.Struct({ t: Schema.Literals(["setAutoCompaction"]), enabled: Schema.Boolean }),
	Schema.Struct({ t: Schema.Literals(["setAutoRetry"]), enabled: Schema.Boolean }),
	/** Stop the retry pi is waiting to make; the failed turn is already over. */
	Schema.Struct({ t: Schema.Literals(["cancelRetry"]) }),
	/** Stop the compaction pi is running. */
	Schema.Struct({ t: Schema.Literals(["abortCompaction"]) }),
	/** Drop what pi holds for the next turn; pi hands the text back for the composer. */
	Schema.Struct({ t: Schema.Literals(["clearQueue"]) }),
	/** A shell command, the way pi's `!cmd` runs one; `!!` keeps it out of the context. */
	Schema.Struct({
		t: Schema.Literals(["bash"]),
		text: Schema.String,
		excludeFromContext: Schema.optional(Schema.Boolean),
	}),
	/** Stop the shell command this chat is running. */
	Schema.Struct({ t: Schema.Literals(["abortBash"]) }),
	/** pi's own hide-thinking setting, so a terminal sees what the dashboard chose. */
	Schema.Struct({ t: Schema.Literals(["setHideThinking"]), hidden: Schema.Boolean }),
	/** The composer's Tools menu: pi's coding tools as one switch; reading stays on. */
	Schema.Struct({ t: Schema.Literals(["setCodingTools"]), enabled: Schema.Boolean }),
	/** The chat's display name, which pi records in the session file. */
	Schema.Struct({ t: Schema.Literals(["setLabel"]), label: Schema.String }),
]);
export type Command = typeof Command.Type;
