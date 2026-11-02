/**
 * The gateway to pi's SDK for everything that is not a conversation. AGENTS.md
 * rule 1 keeps `@earendil-works/*` imports in this file and in
 * `features/conversation/`; the rest of the server imports these names, so an
 * upgrade has one place to check.
 */
import { resolve } from "node:path";

import {
	DefaultPackageManager,
	ModelRuntime,
	ProjectTrustStore,
	SessionManager,
	SettingsManager,
	hasTrustRequiringProjectResources,
	loadSkills,
	loadSkillsFromDir,
} from "@earendil-works/pi-coding-agent";
import type {
	LoadSkillsResult,
	PackageSource,
	ResolvedPaths,
	ResolvedResource,
	SessionInfo,
} from "@earendil-works/pi-coding-agent";

import type { AgentHome } from "./agent-home";

export type {
	LoadExtensionsResult,
	ModelRuntime,
	PackageSource,
	ProjectTrustContext,
	ProjectTrustEvent,
	ProjectTrustEventResult,
	ProjectTrustHandler,
	ProviderModelConfig,
	ResolvedResource,
	ResourceDiagnostic,
	SettingsManager,
	Skill,
} from "@earendil-works/pi-coding-agent";

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
export const settingsManager = (folder: string, home: AgentHome): SettingsManager =>
	SettingsManager.create(folder, home.dir);

/**
 * The home's own settings, with no project layer. The chats folder holds no
 * `.pi`, so pi reads and writes `settings.json` in the home alone.
 */
export const globalSettings = (home: AgentHome): SettingsManager =>
	settingsManager(home.chatsDir, home);

/**
 * `builtinExtensions` names built-ins to resolve as toggleable resources; none
 * by default, which is pi's own default. `settings` lets a caller that edits the
 * same settings afterwards share one writer, so its write queue can be flushed.
 */
export const packageManager = (
	folder: string,
	home: AgentHome,
	builtinExtensions: string[] = [],
	settings: SettingsManager = settingsManager(folder, home),
): DefaultPackageManager =>
	new DefaultPackageManager({
		cwd: folder,
		agentDir: home.dir,
		settingsManager: settings,
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

const summaryOf = (session: SessionInfo): StoredSession => ({
	id: session.id,
	cwd: session.cwd,
	name: session.name,
	created: session.created.toISOString(),
	modified: session.modified.toISOString(),
	messageCount: session.messageCount,
	firstMessage: session.firstMessage,
});

/**
 * pi's `sessionDir` for one folder, resolved the way pi resolves it: `~` is
 * expanded by pi, and a relative path comes from the folder. Undefined means pi's
 * default layout under the agent home.
 */
export const sessionDirOf = (cwd: string, home: AgentHome): string | undefined => {
	const dir = SettingsManager.create(cwd, home.dir).getSessionDir();
	return dir === undefined ? undefined : resolve(cwd, dir);
};

/**
 * Every session pi recorded in this home, from every folder, in pi's order.
 * Grouping and the newest-first sort are the caller's.
 */
const allSessionInfos = async (home: AgentHome): Promise<SessionInfo[]> => {
	// pi reads a project's `sessionDir` before trust so it can find the sessions it
	// wrote there; a host that skipped it would list a different set.
	const homeDir = sessionDirOf(home.chatsDir, home);
	const infos =
		homeDir === undefined ? await SessionManager.listAll() : await SessionManager.listAll(homeDir);
	const listedDirs = new Set(homeDir === undefined ? [] : [homeDir]);
	const seen = new Set(infos.map((session) => session.id));
	const cwds = new Set(infos.map((session) => session.cwd));
	// A project can name its own directory. Its sessions are only discoverable from a
	// cwd the current list already holds, so one that has never written elsewhere
	// cannot be found from the files alone.
	for (const cwd of cwds) {
		const dir = sessionDirOf(cwd, home);
		if (dir === undefined || listedDirs.has(dir)) continue;
		listedDirs.add(dir);
		for (const session of await SessionManager.listAll(dir)) {
			if (seen.has(session.id)) continue;
			seen.add(session.id);
			infos.push(session);
			cwds.add(session.cwd);
		}
	}
	return infos;
};

export const listAllSessions = async (home: AgentHome): Promise<StoredSession[]> =>
	(await allSessionInfos(home)).map(summaryOf);

/**
 * The file and folder of one id, or undefined when the home has no such session.
 * An id is unique across folders, and pi records the folder in the file, so a
 * caller never needs a path from the browser to find a session.
 */
export const locateSession = async (
	id: string,
	home: AgentHome,
): Promise<{ file: string; cwd: string } | undefined> => {
	const session = (await allSessionInfos(home)).find((candidate) => candidate.id === id);
	return session === undefined ? undefined : { file: session.path, cwd: session.cwd };
};

/**
 * A new session in `targetCwd` holding the whole history of `sourceFile`. pi
 * writes the file at once and records the source as its parent. Answers the new id.
 */
export const forkSession = (sourceFile: string, targetCwd: string, home: AgentHome): string =>
	SessionManager.forkFrom(sourceFile, targetCwd, sessionDirOf(targetCwd, home)).getSessionId();

/** Append a display name to a session file that no live engine holds. */
export const setSessionName = (file: string, cwd: string, name: string): void => {
	SessionManager.open(file, undefined, cwd).appendSessionInfo(name);
};

/*
 * Project trust, through pi's own store and its lock. `get` honours a decision
 * saved for a parent folder, the way pi's CLI does, and `set` takes `null` to
 * forget one.
 */
export const projectTrustStore = (home: AgentHome): ProjectTrustStore =>
	new ProjectTrustStore(home.dir);

/**
 * A settings manager in the state pi resolves trust from: the global settings are
 * read, the project's are not, and `getDefaultProjectTrust()` is the home's value.
 */
export const untrustedSettings = (folder: string, home: AgentHome): SettingsManager =>
	SettingsManager.create(folder, home.dir, { projectTrusted: false });

/** Whether the folder holds anything pi only loads for a trusted project. */
export const hasProjectResources = (cwd: string): boolean => hasTrustRequiringProjectResources(cwd);

/*
 * Skills, as pi resolves and loads them. The package manager lists every skill
 * file with its enabled flag and where it came from; the loader parses a file
 * into a skill or a diagnostic. Epsilon asks both instead of scanning folders.
 */

/**
 * Every skill file pi would consider for `folder`, enabled or not: packages,
 * `skills` entries, `.pi/skills`, `.agents/skills`, the home's skills. A missing
 * package is skipped, never installed: reading must not touch the network.
 */
export const resolveSkillResources = async (
	folder: string,
	home: AgentHome,
): Promise<ResolvedResource[]> =>
	(await packageManager(folder, home).resolve(async () => "skip")).skills;

/**
 * Every resource kind pi resolves for `folder`, with the package each came from in
 * its metadata. A missing package is skipped, never installed.
 */
export const resolveAllResources = async (
	folder: string,
	home: AgentHome,
): Promise<ResolvedPaths> => packageManager(folder, home).resolve(async () => "skip");

/**
 * The `source` pi gives a resource path an extension added at runtime through
 * `resources_discover`; the rest of the label is the extension's file name.
 */
export const EXTENSION_RESOURCE_SOURCE = "extension:";

/** pi's own load of these skill files: parsed skills, warnings and name collisions. */
export const loadSkillFiles = (
	folder: string,
	home: AgentHome,
	paths: string[],
): LoadSkillsResult =>
	loadSkills({ cwd: folder, agentDir: home.dir, skillPaths: paths, includeDefaults: false });

/** pi's load of one skills folder that pi itself does not scan, such as `~/.claude/skills`. */
export const loadSkillFolder = (dir: string): LoadSkillsResult =>
	loadSkillsFromDir({ dir, source: "path" });

/** Which `settings.json` holds an entry: the home's, or the project's `.pi`. */
export type SettingsScope = "user" | "project";

/** The `skills` array of one settings file, which holds paths and `-path` overrides. */
export const readSkillEntries = (
	folder: string,
	home: AgentHome,
	scope: SettingsScope,
): string[] => {
	const settings = settingsManager(folder, home);
	const stored = scope === "user" ? settings.getGlobalSettings() : settings.getProjectSettings();
	return [...(stored.skills ?? [])];
};

/** Replaces the `skills` array through pi's setter and waits for the write. */
export const writeSkillEntries = async (
	folder: string,
	home: AgentHome,
	scope: SettingsScope,
	entries: string[],
): Promise<void> => {
	const settings = settingsManager(folder, home);
	if (scope === "user") settings.setSkillPaths(entries);
	else settings.setProjectSkillPaths(entries);
	await settings.flush();
};

/** The `packages` array of one settings file, which holds sources and their filters. */
export const readPackageEntries = (
	folder: string,
	home: AgentHome,
	scope: SettingsScope,
): PackageSource[] => {
	const settings = settingsManager(folder, home);
	const stored = scope === "user" ? settings.getGlobalSettings() : settings.getProjectSettings();
	return [...(stored.packages ?? [])];
};

/** Replaces the `packages` array through pi's setter and waits for the write. */
export const writePackageEntries = async (
	folder: string,
	home: AgentHome,
	scope: SettingsScope,
	entries: PackageSource[],
): Promise<void> => {
	const settings = settingsManager(folder, home);
	if (scope === "user") settings.setPackages(entries);
	else settings.setProjectPackages(entries);
	await settings.flush();
};
