/**
 * Bind pi's extensions to the browser once per session the host holds.
 *
 * This is what makes an extension command that acts on the session work: without
 * `commandContextActions` pi installs handlers that answer `{ cancelled: false }`
 * and do nothing, so `ctx.newSession()`, `ctx.fork()`, `ctx.switchSession()`,
 * `ctx.navigateTree()`, `ctx.reload()` and `ctx.waitForIdle()` report success
 * while the session stays where it was (`dist/core/extensions/runner.js`,
 * `bindCommandContext`).
 */
import type { AgentSession } from "@earendil-works/pi-coding-agent";

import type { SessionHost } from "./host";
import { createUiContext } from "../ui-context";
import type { UiHost } from "../ui-context";

/**
 * pi's own wiring for one session (dist/modes/rpc/rpc-mode.js, `rebindSession`),
 * minus the transport: a replacement is the runtime's operation, a tree move is
 * the session's, and a reload re-reads resources without replacing anything.
 */
const bindSession = async (session: AgentSession, host: SessionHost, ui: UiHost): Promise<void> => {
	await session.bindExtensions({
		uiContext: createUiContext(ui),
		// "json" is the presentation pi names for a headless host, and it stays that even
		// though a browser answers dialogs. docs/pi-sdk.md says why, and that `hasUI` is
		// the field extensions branch on.
		mode: "json",
		commandContextActions: {
			waitForIdle: () => session.waitForIdle(),
			newSession: (options) => host.replace((runtime) => runtime.newSession(options)),
			fork: async (entryId, options) => {
				const result = await host.replace((runtime) => runtime.fork(entryId, options));
				return { cancelled: result.cancelled };
			},
			// A tree move stays inside this session file; the options are pi's, not a
			// subset of them.
			navigateTree: async (targetId, options) => {
				const result = await session.navigateTree(targetId, options);
				return { cancelled: result.cancelled };
			},
			switchSession: (path, options) =>
				host.replace((runtime) => runtime.switchSession(path, options)),
			reload: () => session.reload(),
		},
		// No `abortHandler`: pi's default aborts this session, which is what a web
		// host wants. `shutdownHandler` only records the request; the session's owner
		// closes the engine once it is safe to, like pi's own modes do.
		shutdownHandler: () => host.requestExtensionShutdown(),
		onError: (error) => {
			ui.fail(
				new Error(`extension ${error.extensionPath} failed in ${error.event}: ${error.error}`),
				"EXTENSION_ERROR",
			);
		},
	});
};

/**
 * Wire a host to its sessions: bind the one it holds and every one that replaces
 * it. A replaced session's bindings belong to the session that went, so this is
 * registered first and runs before the owner re-subscribes.
 */
export const bindHost = async (host: SessionHost, ui: UiHost): Promise<void> => {
	host.onSwap((session) => bindSession(session, host, ui));
	await bindSession(host.session, host, ui);
};
