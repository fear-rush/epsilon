/**
 * Epsilon answers pi's built-in slash commands itself, so its catalog has to be pi's own
 * list: same names, same order, same sentences. This reads the pinned package's
 * `BUILTIN_SLASH_COMMANDS`, so a pi upgrade that adds, removes or renames a command fails
 * here instead of letting that name reach the model as a prompt.
 *
 * It lives in `test/` because it reads pi's installed file: `src/domain` imports no
 * `node:*` and no pi code (AGENTS.md, invariant 2).
 */
import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { Option, Schema } from "effect";

import { BUILTIN_COMMANDS } from "../src/domain/conversation/commands.ts";

const PiCommand = Schema.Struct({
	name: Schema.String,
	description: Schema.String,
	argumentHint: Schema.optional(Schema.String),
});
type PiCommand = typeof PiCommand.Type;

/** The one export this test reads, decoded rather than trusted: the file is pi's. */
const PiModule = Schema.Struct({ BUILTIN_SLASH_COMMANDS: Schema.Array(PiCommand) });

/** pi's own list, from the copy this repository pins. */
const piCommands = async (): Promise<ReadonlyArray<PiCommand>> => {
	const entry = Bun.resolveSync("@earendil-works/pi-coding-agent", import.meta.dir);
	const slash = pathToFileURL(join(dirname(entry), "core", "slash-commands.js")).href;
	const module: unknown = await import(slash);
	const decoded = Schema.decodeUnknownOption(PiModule)(module);
	if (Option.isNone(decoded)) {
		throw new Error("pi's slash-commands module no longer exports BUILTIN_SLASH_COMMANDS.");
	}
	return decoded.value.BUILTIN_SLASH_COMMANDS;
};

describe("the built-in command catalog", () => {
	test("is pi's list, in pi's order, with pi's sentences", async () => {
		const pi = await piCommands();
		const ours: PiCommand[] = BUILTIN_COMMANDS.map(({ name, description }) => ({
			description,
			name,
		}));
		expect(ours).toEqual(pi.map(({ description, name }) => ({ description, name })));
	});

	test("takes an argument hint from pi wherever pi declares one", async () => {
		const pi = await piCommands();
		const hints = new Map<string, string | undefined>();
		for (const row of BUILTIN_COMMANDS) {
			hints.set(row.name, "argumentHint" in row ? row.argumentHint : undefined);
		}
		for (const command of pi) {
			if (command.argumentHint === undefined) continue;
			expect(hints.get(command.name)).toBe(command.argumentHint);
		}
	});
});
