/**
 * A line typed in the composer. pi's built-in commands are its editor's job in a
 * terminal, so the host runs the router first; only a name pi does not have
 * reaches `prompt()`, which still expands templates, skills and extension
 * commands.
 */
import type { PromptOptions } from "@earendil-works/pi-coding-agent";
import type { Command } from "shared";

import { runBuiltin } from "../slash";
import type { CommandTarget } from "./context";

export type PromptCommand = Extract<Command, { type: "prompt" }>;

export const runPrompt = async (target: CommandTarget, command: PromptCommand): Promise<void> => {
	const handled = await runBuiltin(
		{
			host: target.host,
			home: target.home,
			reload: () => target.reload(),
			notice: (text) => target.notice(text),
		},
		command.text,
	);
	if (handled) {
		target.resync();
		return;
	}
	await send(target, command);
};

/**
 * `prompt` resolves when the run finishes, but the browser only needs to know
 * that pi accepted it. The preflight hook gives that answer before streaming.
 * `behavior` is what lets a message join a run that is already going: pi refuses
 * a prompt with no queue behavior while streaming, and `steer` cannot carry an
 * extension command at all. An image travels as pi's `ImageContent`, which is
 * the shape the frame already carries; pi normalises it itself, so a prompt with
 * no images passes no image option at all.
 */
const send = (target: CommandTarget, command: PromptCommand): Promise<void> =>
	new Promise((resolve, reject) => {
		let accepted = false;
		const options: PromptOptions = {
			source: "interactive",
			streamingBehavior: command.behavior,
			preflightResult: () => {
				accepted = true;
				resolve();
			},
		};
		if (command.images !== undefined) {
			options.images = command.images.map((image) => ({
				type: "image",
				data: image.data,
				mimeType: image.mimeType,
			}));
		}
		void target.agent.prompt(command.text, options).catch((error) => {
			if (accepted) target.fail(error instanceof Error ? error : new Error(String(error)));
			else reject(error);
		});
	});
