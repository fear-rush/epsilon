import { Option, Schema } from "effect";
import type { Json } from "effect/Schema";

/**
 * The argument shapes the transcript reads, one schema per renderer. A tool name with no
 * schema is not an error: it renders through the generic fallback. These are pi's tool
 * shapes, kept small on purpose: anything not listed here is still shown as JSON, so an
 * unknown or extension tool is never blank.
 */

export const BashArgs = Schema.Struct({ command: Schema.String });

export const EditArgs = Schema.Struct({
	edits: Schema.Array(Schema.Struct({ newText: Schema.String, oldText: Schema.String })),
	path: Schema.String,
});

export const WriteArgs = Schema.Struct({ content: Schema.String, path: Schema.String });

export const ReadArgs = Schema.Struct({ path: Schema.String });

/** The arguments of a known tool, read through the schema for that tool only. */
export type ToolArgs =
	| { readonly kind: "bash"; readonly command: string }
	| {
			readonly kind: "edit";
			readonly path: string;
			readonly edits: ReadonlyArray<{ readonly oldText: string; readonly newText: string }>;
	  }
	| { readonly kind: "write"; readonly path: string; readonly content: string }
	| { readonly kind: "read"; readonly path: string };

export const argsOf = (toolName: string, args: Json | undefined): ToolArgs | undefined => {
	switch (toolName) {
		case "bash":
		case "ls": {
			const parsed = Schema.decodeUnknownOption(BashArgs)(args);
			return Option.isSome(parsed) ? { command: parsed.value.command, kind: "bash" } : undefined;
		}
		case "edit": {
			const parsed = Schema.decodeUnknownOption(EditArgs)(args);
			return Option.isSome(parsed)
				? { edits: parsed.value.edits, kind: "edit", path: parsed.value.path }
				: undefined;
		}
		case "write": {
			const parsed = Schema.decodeUnknownOption(WriteArgs)(args);
			return Option.isSome(parsed)
				? { content: parsed.value.content, kind: "write", path: parsed.value.path }
				: undefined;
		}
		case "read":
		case "find":
		case "grep": {
			const parsed = Schema.decodeUnknownOption(ReadArgs)(args);
			return Option.isSome(parsed) ? { kind: "read", path: parsed.value.path } : undefined;
		}
		default:
			return undefined;
	}
};
