import { resolve, sep } from "node:path";

import { Effect, FileSystem } from "effect";
import type { Scope } from "effect";

import type { NoticeCode, NoticeData } from "#protocol/conversation/frames";
import { CommandRefused } from "#protocol/errors";

import type { ParsedBuiltinCommand } from "../domain/conversation/commands.ts";

/**
 * The built-in command router for the host. pi's TUI answers its built-in slash commands
 * in the editor and `AgentSession.prompt()` has no dispatch for them, so without this a
 * `/compact` typed in the dashboard is sent to the model as text.
 *
 * The rule is one line: a name in `src/domain/conversation/commands.ts` never reaches the
 * model. The engine runs the ones it serves, and every other name is answered with the
 * sentence in its row, because the browser owns that surface. A name pi does not have
 * stays a prompt, which is how an extension command, a template and a `/skill:` entry
 * still reach pi.
 */

export type BuiltinHost = {
	/** The folder the chat runs in, which an import path resolves against. */
	readonly cwd: string;
	readonly homeDir: string;
	/** The sandbox `~` under `bun run dev`; undefined on the operator's own machine. */
	readonly sandboxRoot: string | undefined;
	readonly userHome: string;
	readonly compact: (instructions: string | undefined) => Effect.Effect<void, CommandRefused>;
	readonly importSession: (
		file: string,
	) => Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope>;
	readonly newSession: () => Effect.Effect<
		void,
		CommandRefused,
		FileSystem.FileSystem | Scope.Scope
	>;
	readonly reload: () => Effect.Effect<void, CommandRefused>;
	readonly rename: (name: string | undefined) => Effect.Effect<void, CommandRefused>;
	readonly notice: (code: NoticeCode, data?: NoticeData) => void;
};

/** Everything after the name, trimmed; undefined when the command took nothing. */
const textArgument = (argument: string): string | undefined => {
	const text = argument.trim();
	return text === "" ? undefined : text;
};

/**
 * pi's path argument: one shell word, with a matching pair of quotes allowed around it.
 * A path with a space is quoted the way the terminal takes it, because the composer sends
 * the line as typed.
 */
const pathArgument = (argument: string): string | undefined => {
	const text = argument.trim();
	if (text === "") return undefined;
	const first = text[0];
	if (first === '"' || first === "'") {
		const closing = text.indexOf(first, 1);
		return closing < 0 ? undefined : text.slice(1, closing);
	}
	const space = text.search(/\s/);
	return space < 0 ? text : text.slice(0, space);
};

/** Whether `file` is `root` or inside it, after both are resolved. */
const isInside = (file: string, root: string): boolean => {
	const normalized = resolve(root);
	const prefix = normalized.endsWith(sep) ? normalized : `${normalized}${sep}`;
	const target = resolve(file);
	return target === normalized || target.startsWith(prefix);
};

/**
 * The file an import may read. Under `bun run dev` the sandbox keeps the operator's real
 * disk out, so only a file inside the agent home or inside the sandbox `~` is reachable;
 * on a host, any path pi itself could open.
 */
const importFile = (
	host: BuiltinHost,
	argument: string,
): Effect.Effect<string, CommandRefused, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const raw = pathArgument(argument);
		if (raw === undefined) {
			return yield* refusal("import", "Usage: /import <path to a .jsonl file>");
		}
		if (!raw.endsWith(".jsonl")) {
			return yield* refusal(
				"import",
				"/import reads pi's JSONL session files, and that path is not one.",
			);
		}
		const path = resolve(host.cwd, raw);
		const real = yield* fs.realPath(path).pipe(Effect.orElseSucceed(() => path));
		if (host.sandboxRoot !== undefined) {
			const root = yield* fs
				.realPath(host.sandboxRoot)
				.pipe(Effect.orElseSucceed(() => host.sandboxRoot ?? ""));
			const agentDir = yield* fs
				.realPath(host.homeDir)
				.pipe(Effect.orElseSucceed(() => host.homeDir));
			if (!isInside(real, root) && !isInside(real, agentDir)) {
				return yield* refusal(
					"import",
					`The dev sandbox imports only files inside ${root}. Run bun run dev:host to import from your real disk.`,
				);
			}
		}
		return path;
	});

const refusal = (command: string, reason: string) => new CommandRefused({ command, reason });

/** The pi-surface handler for one row, or undefined when the browser serves it. */
const handler = (
	host: BuiltinHost,
	parsed: ParsedBuiltinCommand,
): Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope> => {
	const { argument, command } = parsed;
	switch (command.name) {
		case "compact":
			return host.compact(textArgument(argument));
		case "import":
			return Effect.gen(function* () {
				const file = yield* importFile(host, argument);
				yield* host.importSession(file);
				host.notice("import-done", { file });
			});
		case "name":
			return host.rename(textArgument(argument));
		case "new":
			return host.newSession();
		case "reload":
			return host.reload();
		default:
			return Effect.sync(() => host.notice("command-unavailable", { name: command.name }));
	}
};

/**
 * Run one line the composer sent. The caller parsed it first, so the text is a builtin; a
 * handler that fails is a notice, and the prompt is never sent to the model.
 */
export const runBuiltin = (
	host: BuiltinHost,
	parsed: ParsedBuiltinCommand,
): Effect.Effect<void, never, FileSystem.FileSystem | Scope.Scope> =>
	handler(host, parsed).pipe(
		Effect.catchTag("CommandRefused", (error) =>
			Effect.sync(() =>
				host.notice("command-failed", { name: parsed.command.name, reason: error.reason }),
			),
		),
	);
