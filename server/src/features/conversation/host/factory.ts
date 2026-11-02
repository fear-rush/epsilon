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
import { hasProjectResources } from "../../../platform/pi";
import { decideProjectTrust, trustExtensions } from "../../projects";
import { builtinExtensions, setCodingTools } from "../engine";
import type { McpReportSink } from "../extensions/mcp-observer";

/** One settings file pi could not load, with pi's own error for it. */
export type SettingsProblem = ReturnType<SettingsManager["drainErrors"]>[number];

export type RuntimeFactoryOptions = {
	home: AgentHome;
	/** A chat starts with the coding tools off. */
	chat: boolean;
	/** Where the MCP observer reports; absent for a copy, which has no panel. */
	onMcpReport?: McpReportSink;
	/** Where a settings file pi could not load is reported; absent for a copy. */
	onSettingsReport?: (problems: SettingsProblem[]) => void;
	/** Where a `project_trust` handler's error is reported; absent for a copy. */
	onTrustReport?: (problems: string[]) => void;
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
 * Trust is decided before the services load the folder. A folder with nothing pi
 * gates is trusted outright. A gated folder starts untrusted, so its own extensions,
 * skills and `SYSTEM.md` stay out of the bootstrap pass; pi's resource loader then
 * runs `project_trust` over the extensions that did load, and reloads with the real
 * answer (`ResourceLoaderReloadOptions.resolveProjectTrust`).
 */
export const createRuntimeFactory =
	(options: RuntimeFactoryOptions): CreateAgentSessionRuntimeFactory =>
	async ({ cwd, sessionManager, sessionStartEvent }): Promise<CreateAgentSessionRuntimeResult> => {
		const gated = hasProjectResources(cwd);
		const settings = SettingsManager.create(cwd, options.home.dir, {
			projectTrusted: !gated,
		});
		const trustProblems: string[] = [];
		const services = await createAgentSessionServices({
			cwd,
			agentDir: options.home.dir,
			settingsManager: settings,
			resourceLoaderOptions: { extensionFactories: builtinExtensions(options.onMcpReport) },
			resourceLoaderReloadOptions: gated
				? {
						resolveProjectTrust: ({ extensionsResult }) =>
							decideProjectTrust({
								cwd,
								home: options.home,
								extensions: trustExtensions(extensionsResult),
								onExtensionError: (message) => trustProblems.push(message),
							}),
					}
				: undefined,
		});
		if (trustProblems.length > 0) options.onTrustReport?.(trustProblems);
		// pi records a file it could not load and falls back to its defaults; the host
		// says so once instead of presenting the fallback as the operator's choice.
		const problems = settings.drainErrors();
		if (problems.length > 0) options.onSettingsReport?.(problems);
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
		return {
			...created,
			services,
			diagnostics: [
				...services.diagnostics,
				...trustProblems.map((message) => ({ type: "warning" as const, message })),
			],
		};
	};
