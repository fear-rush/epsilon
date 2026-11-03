import { Effect } from "effect";
import type { Scope } from "effect";

import { ProcessFailed, TimedOut } from "./errors.ts";

/**
 * Child processes, the one place in the backend that starts them.
 *
 * Everything here runs in its own process group, so a timeout kills the grandchildren
 * too: a `bunx` that spawns a compiler must not leave the compiler holding a pipe after
 * the deadline. `Bun.spawn` is used directly (not Effect's spawner) because only it can
 * open Bun's IPC channel, which is how an engine talks to the supervisor.
 */

/** A tagged IPC message. The receiver decodes it with its own schema. */
export type IpcMessage = { readonly t: string };

const isIpcMessage = (value: unknown): value is IpcMessage =>
	typeof value === "object" && value !== null && "t" in value;

/** Reads a pipe to the end; a non-stream stdio configuration yields no text. */
const readStream = async (
	stream: ReadableStream<Uint8Array> | number | undefined,
): Promise<string> => (typeof stream === "object" ? new Response(stream).text() : "");

export type SpawnOptions = {
	readonly command: ReadonlyArray<string>;
	readonly cwd?: string;
	readonly env?: Record<string, string>;
	/** Open Bun's IPC channel: the engine needs `send` and `message` events. */
	readonly ipc?: boolean;
	readonly onMessage?: (message: IpcMessage) => void;
};

export type ChildHandle = {
	readonly pid: number;
	readonly exited: Promise<number>;
	readonly send: (message: IpcMessage) => void;
	readonly kill: (signal?: NodeJS.Signals) => void;
};

/** Kills the whole group; a child that ignored SIGTERM is escalated by the caller. */
const killGroup = (pid: number, signal: NodeJS.Signals): void => {
	try {
		process.kill(-pid, signal);
	} catch {
		// Already gone: the group leader exited and took its children with it.
	}
};

/** Spawns a child in its own process group and releases (kills) it when the scope closes. */
export const spawnChild = (options: SpawnOptions): Effect.Effect<ChildHandle, never, Scope.Scope> =>
	Effect.acquireRelease(
		Effect.sync(() => {
			const spawnOptions: Parameters<typeof Bun.spawn>[1] = {
				detached: true,
				stderr: "pipe",
				stdout: "pipe",
			};
			if (options.cwd !== undefined) spawnOptions.cwd = options.cwd;
			if (options.env !== undefined) spawnOptions.env = { ...options.env };
			if (options.ipc === true && options.onMessage !== undefined) {
				const onMessage = options.onMessage;
				spawnOptions.ipc = (message: unknown) => {
					if (isIpcMessage(message)) onMessage(message);
				};
			}
			const child = Bun.spawn([...options.command], spawnOptions);
			return {
				exited: child.exited,
				kill: (signal: NodeJS.Signals = "SIGTERM") => {
					killGroup(child.pid, signal);
				},
				pid: child.pid,
				send: (message: IpcMessage) => {
					child.send(message);
				},
			} satisfies ChildHandle;
		}),
		(handle) =>
			Effect.sync(() => {
				handle.kill("SIGKILL");
			}),
	);

export type CommandResult = {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
};

/**
 * Runs a command to completion with a deadline on the whole process group.
 *
 * On the deadline the group gets SIGKILL and the effect fails with `TimedOut`, so a
 * request that triggered the command cannot hang on a pipe a grandchild still holds.
 */
export const runCommand = (
	options: SpawnOptions & { readonly timeoutMs: number },
): Effect.Effect<CommandResult, ProcessFailed | TimedOut> =>
	Effect.gen(function* () {
		const spawnOptions: Parameters<typeof Bun.spawn>[1] = {
			detached: true,
			stderr: "pipe",
			stdout: "pipe",
		};
		if (options.cwd !== undefined) spawnOptions.cwd = options.cwd;
		if (options.env !== undefined) spawnOptions.env = { ...options.env };
		const child = Bun.spawn([...options.command], spawnOptions);
		const command = options.command.join(" ");
		const collect = (async () => {
			const [stdout, stderr, code] = await Promise.all([
				readStream(child.stdout),
				readStream(child.stderr),
				child.exited,
			]);
			return { code, stderr, stdout };
		})();

		const result = yield* Effect.tryPromise({
			try: () =>
				Promise.race([
					collect,
					new Promise<{ readonly timedOut: true }>((resolve) => {
						setTimeout(() => resolve({ timedOut: true }), options.timeoutMs);
					}),
				]),
			catch: (error) => new ProcessFailed({ code: null, command, stderr: String(error) }),
		});

		if ("timedOut" in result) {
			killGroup(child.pid, "SIGKILL");
			return yield* new TimedOut({ afterMs: options.timeoutMs, what: command });
		}
		if (result.code !== 0) {
			return yield* new ProcessFailed({ code: result.code, command, stderr: result.stderr });
		}
		return result;
	});
