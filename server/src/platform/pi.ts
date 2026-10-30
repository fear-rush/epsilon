/**
 * The gateway to pi's SDK for everything that is not a conversation. AGENTS.md
 * rule 1 keeps `@earendil-works/*` imports in this file and in
 * `features/conversation/`; the rest of the server imports these names, so an
 * upgrade has one place to check.
 */
import {
	DefaultPackageManager,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";

import type { AgentHome } from "./agent-home";

export type { ModelRuntime, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/*
 * The sign-in vocabulary, read from `ModelRuntime.login()`'s own signature. pi
 * keeps these types in `pi-ai`, which this workspace does not depend on, and
 * re-exports none of them, so they are derived here instead of restated.
 */
type AuthInteraction = Parameters<ModelRuntime["login"]>[2];

/** One question pi asks during a sign-in. */
export type AuthPrompt = Parameters<AuthInteraction["prompt"]>[0];

/** One progress or instruction message pi reports during a sign-in. */
export type AuthEvent = Parameters<AuthInteraction["notify"]>[0];

/*
 * The model runtime, built from the agent home and nothing else. Every non-
 * conversation read of providers, credentials and the model catalog goes through
 * here, so the answer matches what the engine's own runtime would see
 * (`agent-session-services.js` builds it from the same two files).
 */
export const modelRuntime = (home: AgentHome): Promise<ModelRuntime> =>
	ModelRuntime.create({ authPath: home.authFile, modelsPath: home.modelsFile });

/**
 * A runtime with no models file, which exposes only the providers pi ships. It
 * answers "which ids are built in" independent of `models.json`.
 */
export const builtinRuntime = (home: AgentHome): Promise<ModelRuntime> =>
	ModelRuntime.create({
		authPath: home.authFile,
		modelsPath: null,
		// Only the built-in id list is needed; do not resolve credentials or refresh.
		refreshOnCreate: false,
	});

/*
 * pi's exported writers for its own settings and packages. They own scopes,
 * locking and merge order, so the dashboard calls them instead of writing
 * `settings.json` by hand (docs/DECISIONS.md, Configure in the dashboard).
 */
export const settingsManager = (projectDir: string, home: AgentHome): SettingsManager =>
	SettingsManager.create(projectDir, home.dir);

/**
 * `builtinExtensions` names built-ins to resolve as toggleable resources; none
 * by default, which is pi's own default.
 */
export const packageManager = (
	projectDir: string,
	home: AgentHome,
	builtinExtensions: string[] = [],
): DefaultPackageManager =>
	new DefaultPackageManager({
		cwd: projectDir,
		agentDir: home.dir,
		settingsManager: settingsManager(projectDir, home),
		builtinExtensions,
	});

/*
 * pi's session files, as far as non-conversation code needs them. pi's
 * `SessionInfo` carries `allMessagesText`, which is every message ever written;
 * a list never needs it, so only the summary fields leave this module.
 */
export type StoredSession = {
	id: string;
	cwd: string;
	name?: string;
	created: string;
	modified: string;
	messageCount: number;
	firstMessage: string;
};

/** Sessions pi recorded for this project, in pi's order. Newest sort is the caller's. */
export const listStoredSessions = async (projectDir: string): Promise<StoredSession[]> => {
	const sessions = await SessionManager.list(projectDir);
	return sessions.map((session) => ({
		id: session.id,
		cwd: session.cwd,
		name: session.name,
		created: session.created.toISOString(),
		modified: session.modified.toISOString(),
		messageCount: session.messageCount,
		firstMessage: session.firstMessage,
	}));
};

/**
 * The file for one id, or undefined when this project has no such session. A
 * delete must resolve through this, never through a path the browser sent.
 */
export const findSessionFile = (projectDir: string, id: string): string | undefined =>
	SessionManager.findById(projectDir, id);
