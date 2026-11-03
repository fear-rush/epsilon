import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import { EngineStartFailed } from "./errors.ts";
import { describe } from "./runtime.ts";
import type { RuntimeHandle } from "./runtime.ts";
import type { UiBridge } from "./ui.ts";
import { createUiContext } from "./ui.ts";

/**
 * pi's own wiring for one session (`dist/modes/rpc/rpc-mode.js`, `rebindSession`), minus
 * the transport.
 *
 * pi hands extensions Promises, so the three replacements are the engine's second Promise
 * boundary, like `ui.ts`: each one runs the runtime's Effect and answers pi with its
 * result. Everything else is the session's own method call.
 */

export type BindingDeps = {
	readonly sessionId: string;
	readonly runtime: RuntimeHandle;
	readonly ui: UiBridge;
	readonly onShutdown: () => void;
	readonly onError: (message: string) => void;
};

export const bindEngineSession = (
	session: AgentSession,
	deps: BindingDeps,
): Effect.Effect<void, EngineStartFailed> =>
	Effect.tryPromise({
		try: () =>
			session.bindExtensions({
				// "json" is the presentation pi names for a headless host, and `hasUI` is the
				// field extensions branch on. docs/pi-sdk.md explains why both are honest.
				commandContextActions: {
					waitForIdle: () => session.waitForIdle(),
					newSession: (options) =>
						Effect.runPromise(deps.runtime.replace((runtime) => runtime.newSession(options))),
					fork: (entryId, options) =>
						Effect.runPromise(deps.runtime.replace((runtime) => runtime.fork(entryId, options))),
					// A tree move stays inside this session file; the options are pi's own.
					navigateTree: (targetId, options) => session.navigateTree(targetId, options),
					switchSession: (path, options) =>
						Effect.runPromise(
							deps.runtime.replace((runtime) => runtime.switchSession(path, options)),
						),
					reload: () => session.reload(),
				},
				// No `abortHandler`: pi's default aborts this session, which is what a headless
				// host wants. A shutdown request is recorded; the owner closes the engine once
				// the work in flight is done.
				mode: "json",
				onError: (error) => {
					deps.onError(`Extension ${error.extensionPath} failed in ${error.event}: ${error.error}`);
				},
				shutdownHandler: () => {
					deps.onShutdown();
				},
				uiContext: createUiContext(deps.ui.host),
			}),
		catch: (cause) => new EngineStartFailed({ reason: describe(cause), sessionId: deps.sessionId }),
	});
