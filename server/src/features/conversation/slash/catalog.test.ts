/**
 * Epsilon answers pi's built-in slash commands itself, so its catalog has to be
 * pi's own list: same names, same order, same sentences. This reads the pinned
 * package's `BUILTIN_SLASH_COMMANDS`, so a pi upgrade that adds, removes or renames
 * a command fails here instead of letting that name reach the model as a prompt.
 */
import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { BUILTIN_COMMANDS } from "shared";

type PiCommand = { name: string; description: string; argumentHint?: string };

/** pi's own list, from the copy this repository pins. */
const piCommands = async (): Promise<PiCommand[]> => {
	const entry = Bun.resolveSync("@earendil-works/pi-coding-agent", import.meta.dir);
	const slash = pathToFileURL(join(dirname(entry), "core", "slash-commands.js")).href;
	// SAFETY: that file is pi's own module and exports `BUILTIN_SLASH_COMMANDS`; a
	// pi upgrade that moves or renames it fails at this import, not silently below.
	const module = (await import(slash)) as { BUILTIN_SLASH_COMMANDS: PiCommand[] };
	return module.BUILTIN_SLASH_COMMANDS;
};

describe("the built-in command catalog", () => {
	test("is pi's list, in pi's order, with pi's sentences", async () => {
		const pi = await piCommands();
		const ours: PiCommand[] = BUILTIN_COMMANDS.map(({ name, description }) => ({
			name,
			description,
		}));
		expect(ours).toEqual(pi.map(({ name, description }) => ({ name, description })));
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
