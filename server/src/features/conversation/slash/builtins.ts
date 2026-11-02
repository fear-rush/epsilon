/**
 * The built-in commands the host runs: pi's own session operations, called on the
 * embedded runtime instead of through a terminal. Each one either acts or throws a
 * sentence the tab shows; none of them touches the model.
 */
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

import type { HostCommandName } from "shared";

import type { AgentHome } from "../../../platform/agent-home";
import { isInside } from "../../projects";
import type { SessionHost } from "../host/host";
import { pathArgument, textArgument } from "./arguments";

export type BuiltinContext = {
	host: SessionHost;
	home: AgentHome;
	/** Re-read extensions, skills, packages and the model catalog in place. */
	reload: () => Promise<void>;
	/** Say something no command frame carries: a refusal, or what a command did. */
	notice: (text: string) => void;
};

type Handler = (context: BuiltinContext, argument: string) => Promise<void>;

/** A path as the file system resolves it, or as written when it does not exist. */
const realOf = async (path: string): Promise<string> => realpath(path).catch(() => path);

/**
 * The file an import may read. Under `bun run dev` the sandbox keeps the operator's
 * real disk out, so only a file inside the agent home or inside the sandbox `~` is
 * reachable; on a host, any path pi itself could open.
 */
const importFile = async (home: AgentHome, cwd: string, argument: string): Promise<string> => {
	const raw = pathArgument(argument);
	if (raw === undefined) throw new Error("Usage: /import <path to a .jsonl file>");
	if (!raw.endsWith(".jsonl")) {
		throw new Error("/import reads pi's JSONL session files, and that path is not one.");
	}
	const path = resolve(cwd, raw);
	const file = await realOf(path);
	const sandbox = home.projectsRoot;
	if (sandbox !== undefined) {
		const root = await realOf(sandbox);
		const agentDir = await realOf(home.dir);
		if (!isInside(file, root) && !isInside(file, agentDir)) {
			throw new Error(
				`The dev sandbox imports only files inside ${root}. Run bun run dev:host to import from your real disk.`,
			);
		}
	}
	return file;
};

/** Every `surface: "pi"` row of `shared/src/conversation/commands.ts`, by pi's name. */
const HANDLERS = {
	compact: async ({ host }, argument) => {
		// pi aborts a running turn before it compacts, so a busy session takes this.
		await host.session.compact(textArgument(argument));
	},
	import: async ({ host, home, notice }, argument) => {
		const file = await importFile(home, host.cwd, argument);
		const result = await host.replace((runtime) => runtime.importFromJsonl(file));
		if (result.cancelled) throw new Error("pi cancelled the import.");
		notice(`Imported ${file}. This chat continues in the imported session.`);
	},
	name: async ({ host, notice }, argument) => {
		const name = textArgument(argument);
		const current = host.session.sessionName;
		if (name === undefined) {
			notice(
				current === undefined
					? "This chat has no name. Use /name <name>."
					: `This chat is called "${current}". Use /name <name> to change it.`,
			);
			return;
		}
		host.session.setSessionName(name);
	},
	new: async ({ host }) => {
		// pi replaces the session and the tab follows the new id; the old file stays on
		// disk, so the chat is still in the list under its old id.
		const result = await host.replace((runtime) => runtime.newSession());
		if (result.cancelled) throw new Error("pi cancelled the new session.");
	},
	reload: async ({ reload }) => {
		await reload();
	},
} satisfies Record<HostCommandName, Handler>;

/** The handler for pi's name, or undefined when the browser serves it instead. */
export const hostHandler = (name: string): Handler | undefined => {
	if (!Object.hasOwn(HANDLERS, name)) return undefined;
	// SAFETY: `HANDLERS` was checked with `satisfies Record<HostCommandName, Handler>`,
	// so every key it has is a host command name.
	return HANDLERS[name as HostCommandName];
};
