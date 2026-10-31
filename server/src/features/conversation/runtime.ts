/**
 * A short-lived `AgentSessionRuntime` for the copies pi only makes by replacing the
 * session it holds: the fork at a message, and the clone of the position a chat is
 * at (docs/DECISIONS.md, Session copies).
 *
 * `AgentSessionRuntime.fork` tears its current session down and builds the next one
 * from a new session manager, so a copy cannot use the live engine: that one
 * belongs to the tabs, and the copy ends with a new session id the page navigates
 * to. The runtime built here is wired like the live engine — same settings manager,
 * same resource loader (extensions, skills, packages), same UI bridge — and is
 * disposed in `finally`, so nothing of it outlives the request.
 */
import {
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type {
	AgentSessionRuntime,
	CreateAgentSessionRuntimeResult,
} from "@earendil-works/pi-coding-agent";

import type { AgentHome } from "../../platform/agent-home";
import { bindEngine, builtinExtensions } from "./engine";
import type { UiHost } from "./ui-context";

/**
 * What a copy's extensions get: no tab is attached while the copy runs, so a
 * question is answered as the cancelled dialog a closed tab answers with, and the
 * display requests are dropped. The runtime is thrown away at the end of the copy;
 * the new session shows its own notices once the page opens it.
 */
const NO_TAB: UiHost = {
	ask: async (question) => ({ id: question.id, method: "cancel" }),
	display: () => undefined,
	unsupported: () => undefined,
	fail: () => undefined,
};

export type RuntimeOptions = {
	home: AgentHome;
	/** The folder the session runs in, already checked against pi's trust store. */
	cwd: string;
	/** A chat's folder holds no `.pi`; a project's loads only because it is trusted. */
	chat: boolean;
	/** The session file the copy starts from. */
	file: string;
};

/**
 * Build a runtime for one session file, run one replacement on it, and dispose it.
 * `run` answers what the caller keeps — the new session's id — because the runtime
 * itself, and every session it held, is gone once this returns.
 */
export const withRuntime = async <Result>(
	{ home, cwd, chat, file }: RuntimeOptions,
	run: (runtime: AgentSessionRuntime) => Promise<Result>,
): Promise<Result> => {
	const runtime = await createAgentSessionRuntime(
		async ({
			cwd: effective,
			sessionManager,
			sessionStartEvent,
		}): Promise<CreateAgentSessionRuntimeResult> => {
			const services = await createAgentSessionServices({
				cwd: effective,
				agentDir: home.dir,
				// pi's `SettingsManager` starts trusted, and nothing in the SDK decides
				// it (docs/pi-sdk.md, Project trust); the registry checked the store first.
				settingsManager: SettingsManager.create(effective, home.dir, {
					projectTrusted: !chat,
				}),
				resourceLoaderOptions: { extensionFactories: builtinExtensions() },
			});
			const created = await createAgentSessionFromServices({
				services,
				sessionManager,
				sessionStartEvent,
			});
			return { ...created, services, diagnostics: services.diagnostics };
		},
		{ cwd, agentDir: home.dir, sessionManager: SessionManager.open(file, undefined, cwd) },
	);
	try {
		// The replacement is a new session, so the extensions bound for the one it
		// replaced are rebound to it: pi's runtime calls this after every swap.
		runtime.setRebindSession((session) => bindEngine(session, NO_TAB));
		await bindEngine(runtime.session, NO_TAB);
		return await run(runtime);
	} finally {
		await runtime.dispose();
	}
};
