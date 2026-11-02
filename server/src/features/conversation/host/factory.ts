/**
 * The one place a runtime's cwd-bound services are built. A live chat and a
 * transient copy both come from this closure, so both load the same settings,
 * extensions, skills, packages and MCP config.
 *
 * pi calls the factory again for every replacement — `/new`, a switch, a fork —
 * with the effective cwd, so nothing here may close over a session or a file.
 */
import {
	createAgentSessionFromServices,
	createAgentSessionServices,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type {
	CreateAgentSessionRuntimeFactory,
	CreateAgentSessionRuntimeResult,
} from "@earendil-works/pi-coding-agent";

import type { AgentHome } from "../../../platform/agent-home";
import { builtinExtensions, setCodingTools } from "../engine";

export type RuntimeFactoryOptions = {
	home: AgentHome;
	/** A chat's folder holds no `.pi`, so only a project's folder can be trusted. */
	chat: boolean;
};

/**
 * An existing session opens from the file the registry located. A fresh id, which
 * the browser mints for "New chat", creates pi's session with that exact id; pi
 * writes the file on the first message.
 */
export const openSessionManager = (
	cwd: string,
	sessionId: string,
	file: string | undefined,
): SessionManager =>
	file === undefined
		? SessionManager.create(cwd, undefined, { id: sessionId })
		: SessionManager.open(file, undefined, cwd);

/**
 * Trust is decided by the caller and passed before the services exist, because the
 * resource loader reads the folder's `.pi` the moment it is built. pi exposes no
 * resolver for the SDK to consult (docs/pi-sdk.md, Traps).
 */
export const createRuntimeFactory =
	(options: RuntimeFactoryOptions): CreateAgentSessionRuntimeFactory =>
	async ({ cwd, sessionManager, sessionStartEvent }): Promise<CreateAgentSessionRuntimeResult> => {
		const services = await createAgentSessionServices({
			cwd,
			agentDir: options.home.dir,
			settingsManager: SettingsManager.create(cwd, options.home.dir, {
				projectTrusted: !options.chat,
			}),
			resourceLoaderOptions: { extensionFactories: builtinExtensions() },
		});
		const created = await createAgentSessionFromServices({
			services,
			sessionManager,
			sessionStartEvent,
		});
		// A chat starts with the coding tools off. pi records a loadout in the
		// transcript and restores it on reopen, so only an empty session takes the
		// default, and a replacement in a chat starts the same way a new chat does.
		if (options.chat && sessionManager.getEntryCount() === 0) {
			setCodingTools(created.session, false);
		}
		return { ...created, services, diagnostics: services.diagnostics };
	};
