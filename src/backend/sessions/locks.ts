import { Context, Effect, Layer } from "effect";

/**
 * Whether an engine holds a chat right now.
 *
 * The catalog needs this before it moves, renames or deletes a session file: a running
 * engine appends while the file moves, and the old code lost that race (F1). The real
 * implementation is the engine registry in Step 5; until then the layer answers "nothing
 * is running", and tests provide their own set.
 */
export type SessionLocksApi = {
	readonly isRunning: (sessionId: string) => Effect.Effect<boolean>;
};

export class SessionLocks extends Context.Service<SessionLocks, SessionLocksApi>()(
	"epsilon/SessionLocks",
) {}

export const makeSessionLocks = (running: ReadonlySet<string>): SessionLocksApi => ({
	isRunning: (sessionId) => Effect.succeed(running.has(sessionId)),
});

/** Step 5 replaces this with the registry's answer; a missing engine is not running. */
export const SessionLocksLive = Layer.succeed(SessionLocks, makeSessionLocks(new Set()));
