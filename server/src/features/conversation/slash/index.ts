/**
 * The built-in command router. pi's TUI answers these in its editor and
 * `AgentSession.prompt()` has no dispatch for them, so without this a `/compact`
 * typed in the dashboard is sent to the model as text.
 *
 * The rule is one line: a name in `shared/src/conversation/commands.ts` never
 * reaches the model. The host runs the ones it serves, and every other name is
 * answered with the sentence in its row, because the browser owns that surface.
 * A name pi does not have stays a prompt, which is how an extension command, a
 * prompt template and a `/skill:` entry still reach pi.
 */
import { parseBuiltinCommand } from "shared";

import { hostHandler } from "./builtins";
import type { BuiltinContext } from "./builtins";

export type SlashContext = BuiltinContext;

/**
 * Run one line typed in the composer. Returns whether the text was a command at
 * all, so the caller knows whether to prompt the model.
 */
export const runBuiltin = async (context: SlashContext, text: string): Promise<boolean> => {
	const parsed = parseBuiltinCommand(text);
	if (parsed === undefined) return false;
	const { command, argument } = parsed;
	const handler = hostHandler(command.name);
	if (handler === undefined) {
		context.notice(
			command.refusal ??
				`/${command.name} is answered by Epsilon's own interface, not by this engine. Nothing was sent to the model.`,
		);
		return true;
	}
	try {
		await handler(context, argument);
	} catch (error) {
		context.notice(`/${command.name}: ${error instanceof Error ? error.message : String(error)}`);
	}
	return true;
};
