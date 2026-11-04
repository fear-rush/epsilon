import { join } from "node:path";

import {
	DefaultPackageManager,
	ProjectTrustStore,
	SettingsManager,
	ModelRuntime,
	hasTrustRequiringProjectResources,
	loadProjectContextFiles,
	loadSkills,
	parseFrontmatter,
} from "@earendil-works/pi-coding-agent";
import type {
	LoadSkillsResult,
	PackageSource,
	ResolvedPaths,
} from "@earendil-works/pi-coding-agent";
import { Context, Effect, Layer } from "effect";

import type { SettingsProblem } from "#protocol/config/general";
import type { ProviderLoginType } from "#protocol/config/providers";
import { PackageFailed, ProviderRefused, ProjectRefused, SkillRefused } from "#protocol/errors";

import { AgentHome } from "./agent-home.ts";
import type { AgentHomeApi } from "./agent-home.ts";
import { RuntimeUnavailable } from "./errors.ts";
import { isJsonObject } from "./patch.ts";
import type { JsonObject } from "./patch.ts";

/**
 * The only place Epsilon's backend imports pi's configuration exporters.
 *
 * Every reader here takes the directory it works on. That matters: pi's defaults fall
 * back to `getAgentDir()`, which reads `PI_CODING_AGENT_DIR`, so a forgotten argument
 * would silently point at the operator's real home while a test believes it is on a
 * scratch one. (MCP is the exception that forces `main.ts` to export that variable: its
 * config loader takes no directory. See `docs/pi-sdk.md`.)
 */

/** What pi hands the prompt and notify callbacks of one sign-in. */
export type AuthInteraction = Parameters<ModelRuntime["login"]>[2];

/** One question pi asks during a sign-in. */
export type AuthPrompt = Parameters<AuthInteraction["prompt"]>[0];

/** One progress or instruction message pi reports during a sign-in. */
export type AuthEvent = Parameters<AuthInteraction["notify"]>[0];

/** What pi can collect for a provider, and the one call that writes the credential. */
export type PiProviderLoginApi = {
	readonly providerLogin: (
		providerId: string,
	) => Effect.Effect<
		{ readonly name: string; readonly oauth: boolean; readonly apiKey: boolean },
		ProviderRefused
	>;
	readonly login: (
		providerId: string,
		type: ProviderLoginType,
		interaction: {
			readonly signal: AbortSignal;
			readonly prompt: (prompt: AuthPrompt) => Effect.Effect<string, Error>;
			readonly notify: (event: AuthEvent) => void;
		},
	) => Effect.Effect<void, ProviderRefused>;
};

/** pi's own types, re-exported so no other backend file imports the package. */
export type { SettingsManager } from "@earendil-works/pi-coding-agent";
export type { ModelRuntime } from "@earendil-works/pi-coding-agent";
export type { PackageSource, ResolvedPaths } from "@earendil-works/pi-coding-agent";
export type {
	LoadSkillsResult,
	PathMetadata,
	ResolvedResource,
	ResourceDiagnostic,
	Skill,
} from "@earendil-works/pi-coding-agent";

/** pi's synthetic path prefix for a built-in extension. */
export const BUILTIN_PATH_PREFIX = "builtin:";

/** pi marks a resource an extension added at runtime with this source prefix. */
export { EXTENSION_RESOURCE_SOURCE } from "../../domain/skills/rules.ts";

/** pi's default for a folder that nothing else decides. */
export type ProjectTrustDefault = "always" | "never" | "ask";

/**
 * pi's project trust as the backend can read and write it: the store's decision, the
 * folder's own record, whether anything is gated, and the home's default.
 */
export type PiProjectTrustApi = {
	readonly hasResources: (cwd: string) => Effect.Effect<boolean>;
	/** The closest saved decision, or null when no record covers the folder. */
	readonly read: (cwd: string) => Effect.Effect<boolean | null>;
	/** The path of this folder's own record, so a status can say a parent's decision counts. */
	readonly entry: (cwd: string) => Effect.Effect<string | null>;
	readonly write: (cwd: string, decision: boolean | null) => Effect.Effect<void, ProjectRefused>;
	readonly writeMany: (
		updates: ReadonlyArray<{ readonly path: string; readonly decision: boolean | null }>,
	) => Effect.Effect<void, ProjectRefused>;
	/** `defaultProjectTrust`, read from the home's settings alone. */
	readonly defaultTrust: (cwd: string) => Effect.Effect<ProjectTrustDefault>;
};

/**
 * pi's `skills` setting for one folder, plus the resolver and loader the inventory asks.
 * The array is settings, not a pi format Epsilon owns; a write goes through pi's own
 * setters so merge order and locking stay pi's.
 */
export type PiSkillsApi = {
	readonly resolve: Effect.Effect<ResolvedPaths, SkillRefused>;
	readonly load: (paths: ReadonlyArray<string>) => Effect.Effect<LoadSkillsResult>;
	readonly entries: (scope: PackageScope) => Effect.Effect<ReadonlyArray<string>>;
	readonly writeEntries: (
		scope: PackageScope,
		entries: ReadonlyArray<string>,
	) => Effect.Effect<void, SkillRefused>;
};

/**
 * The context pi resolves for a folder without a session: the files it applies and its
 * own frontmatter parser, which a prompt template read needs.
 */
export type PiContextApi = {
	readonly files: Effect.Effect<ReadonlyArray<{ readonly path: string }>>;
	/** The parsed frontmatter and body, or undefined when the file's frontmatter does not parse. */
	readonly frontmatter: (
		text: string,
	) => Effect.Effect<{ readonly frontmatter: JsonObject; readonly body: string } | undefined>;
};

/** pi's two package scopes; the manager's `temporary` scope is never stored. */
export type PackageScope = "user" | "project";

/** One entry pi's settings declare, as its manager reports it. */
export type ConfiguredPackage = ReturnType<DefaultPackageManager["listConfiguredPackages"]>[number];

/** One newer version pi found for a declared package. */
export type PackageUpdate = Awaited<
	ReturnType<DefaultPackageManager["checkForAvailableUpdates"]>
>[number];

/**
 * pi's package manager for one folder, with the settings writer it owns. Every operation
 * is an Effect here and nowhere else: pi speaks Promises and throws its own errors, and
 * the rest of the backend sees `PackageFailed`.
 */
export type PiPackagesApi = {
	readonly list: Effect.Effect<ReadonlyArray<ConfiguredPackage>>;
	readonly entries: (scope: PackageScope) => Effect.Effect<ReadonlyArray<PackageSource>>;
	readonly writeEntries: (
		scope: PackageScope,
		entries: ReadonlyArray<PackageSource>,
	) => Effect.Effect<void, PackageFailed>;
	readonly resolve: Effect.Effect<ResolvedPaths, PackageFailed>;
	readonly install: (source: string, local: boolean) => Effect.Effect<void, PackageFailed>;
	readonly remove: (source: string, local: boolean) => Effect.Effect<boolean, PackageFailed>;
	readonly update: (source: string) => Effect.Effect<void, PackageFailed>;
	readonly updates: Effect.Effect<ReadonlyArray<PackageUpdate>, PackageFailed>;
};

export type PiConfigApi = {
	/** pi's merged settings for a folder, read through its own manager. */
	readonly settings: (cwd: string) => Effect.Effect<SettingsManager>;
	/** The settings file Epsilon writes with pi's lock. */
	readonly settingsPath: Effect.Effect<string>;
	/** pi's composed model catalog and credential store, built from this home. */
	readonly models: Effect.Effect<ModelRuntime, RuntimeUnavailable>;
	/**
	 * A runtime with no `models.json`, so it knows only what pi ships. It answers "which
	 * ids are built in" independent of this home's file (F8l).
	 */
	readonly builtinModels: Effect.Effect<ModelRuntime, RuntimeUnavailable>;
	/** pi's package manager for one folder, built with a settings writer for that folder. */
	readonly packages: (cwd: string) => PiPackagesApi;
	/** pi's skill resolver, loader and `skills` setting for one folder. */
	readonly skills: (cwd: string) => PiSkillsApi;
	/** How pi finds the context for one folder, before a session opens. */
	readonly context: (cwd: string) => PiContextApi;
	/** pi's sign-in for one provider; the credential is written by pi, never here. */
	readonly providerLogin: PiProviderLoginApi;
	/** pi's `trust.json`, shared with a terminal pi on the same home. */
	readonly projectTrust: PiProjectTrustApi;
	/** The load errors pi's settings managers recorded for a folder, both scopes. */
	readonly settingsProblems: (cwd: string) => Effect.Effect<ReadonlyArray<SettingsProblem>>;
};

export class PiConfig extends Context.Service<PiConfig, PiConfigApi>()("epsilon/PiConfig") {}

const describe = (cause: unknown): string =>
	cause instanceof Error ? cause.message : String(cause);

const packageFailure = (source: string | undefined, cause: unknown): PackageFailed =>
	new PackageFailed(
		source === undefined ? { reason: describe(cause) } : { reason: describe(cause), source },
	);

const trustFailure = (cause: unknown): ProjectRefused =>
	new ProjectRefused({ reason: describe(cause) });

const loginFailure =
	(providerId: string) =>
	(cause: unknown): ProviderRefused =>
		new ProviderRefused({ providerId, reason: describe(cause) });

const makeProjectTrust = (home: AgentHomeApi): PiProjectTrustApi => {
	const store = new ProjectTrustStore(home.agentDir);
	return {
		defaultTrust: (cwd) =>
			Effect.sync(() =>
				SettingsManager.create(cwd, home.agentDir, {
					projectTrusted: false,
				}).getDefaultProjectTrust(),
			),
		entry: (cwd) => Effect.sync(() => store.getEntry(cwd)?.path ?? null),
		hasResources: (cwd) => Effect.sync(() => hasTrustRequiringProjectResources(cwd)),
		read: (cwd) => Effect.sync(() => store.get(cwd)),
		write: (cwd, decision) =>
			Effect.try({ try: () => store.set(cwd, decision), catch: trustFailure }),
		writeMany: (updates) =>
			Effect.try({
				try: () => store.setMany(updates.map(({ path, decision }) => ({ decision, path }))),
				catch: trustFailure,
			}),
	};
};

const skillFailure = (cause: unknown): SkillRefused =>
	new SkillRefused({ reason: describe(cause) });

const makeContext = (home: AgentHomeApi, cwd: string): PiContextApi => ({
	files: Effect.sync(() =>
		loadProjectContextFiles({ agentDir: home.agentDir, cwd }).map((file) => ({
			path: file.path,
		})),
	),
	frontmatter: (text) =>
		Effect.sync(() => {
			try {
				const parsed = parseFrontmatter(text);
				return isJsonObject(parsed.frontmatter)
					? { body: parsed.body, frontmatter: parsed.frontmatter }
					: undefined;
			} catch {
				return undefined;
			}
		}),
});

const makeSkills = (home: AgentHomeApi, cwd: string): PiSkillsApi => {
	const settings = SettingsManager.create(cwd, home.agentDir);
	const manager = new DefaultPackageManager({
		agentDir: home.agentDir,
		cwd,
		settingsManager: settings,
	});
	return {
		entries: (scope) =>
			Effect.sync(() => [
				...((scope === "user" ? settings.getGlobalSettings() : settings.getProjectSettings())
					.skills ?? []),
			]),
		load: (paths) =>
			Effect.sync(() =>
				loadSkills({
					agentDir: home.agentDir,
					cwd,
					includeDefaults: false,
					// pi's resolver can hand back a resource it could not place, which has no
					// path at runtime; one of those makes pi's own validator refuse every path.
					skillPaths: paths.filter((path) => typeof path === "string"),
				}),
			),
		resolve: Effect.tryPromise({
			try: () => manager.resolve(() => Promise.resolve("skip")),
			catch: skillFailure,
		}),
		writeEntries: (scope, entries) =>
			Effect.tryPromise({
				try: () => {
					if (scope === "user") settings.setSkillPaths([...entries]);
					else settings.setProjectSkillPaths([...entries]);
					return settings.flush();
				},
				catch: skillFailure,
			}),
	};
};

const makePackages = (
	manager: DefaultPackageManager,
	settings: SettingsManager,
): PiPackagesApi => ({
	entries: (scope) =>
		Effect.sync(() => [
			...((scope === "user" ? settings.getGlobalSettings() : settings.getProjectSettings())
				.packages ?? []),
		]),
	list: Effect.sync(() => manager.listConfiguredPackages()),
	install: (source, local) =>
		Effect.tryPromise({
			try: () => manager.installAndPersist(source, { local }),
			catch: (cause) => packageFailure(source, cause),
		}),
	remove: (source, local) =>
		Effect.tryPromise({
			try: () => manager.removeAndPersist(source, { local }),
			catch: (cause) => packageFailure(source, cause),
		}),
	resolve: Effect.tryPromise({
		try: () => manager.resolve(() => Promise.resolve("skip")),
		catch: (cause) => packageFailure(undefined, cause),
	}),
	update: (source) =>
		Effect.tryPromise({
			try: () => manager.update(source),
			catch: (cause) => packageFailure(source, cause),
		}),
	updates: Effect.tryPromise({
		try: () => manager.checkForAvailableUpdates(),
		catch: (cause) => packageFailure(undefined, cause),
	}),
	writeEntries: (scope, entries) =>
		Effect.tryPromise({
			try: () => {
				if (scope === "user") settings.setPackages([...entries]);
				else settings.setProjectPackages([...entries]);
				return settings.flush();
			},
			catch: (cause) => packageFailure(undefined, cause),
		}),
});

/** The pinned pi version, for a crash record and Diagnostics. */
export {
	VERSION as piVersion,
	CURRENT_SESSION_VERSION as sessionFormatVersion,
} from "@earendil-works/pi-coding-agent";

export const PiConfigLive: Layer.Layer<PiConfig, never, AgentHome> = Layer.effect(
	PiConfig,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const models = Effect.tryPromise({
			try: () =>
				ModelRuntime.create({
					authPath: join(home.agentDir, "auth.json"),
					modelsPath: join(home.agentDir, "models.json"),
				}),
			catch: (cause) =>
				new RuntimeUnavailable({
					reason: cause instanceof Error ? cause.message : String(cause),
				}),
		});
		const builtinModels = Effect.tryPromise({
			try: () =>
				ModelRuntime.create({
					authPath: join(home.agentDir, "auth.json"),
					modelsPath: null,
					refreshOnCreate: false,
				}),
			catch: (cause) =>
				new RuntimeUnavailable({
					reason: cause instanceof Error ? cause.message : String(cause),
				}),
		});
		const providerLogin: PiProviderLoginApi = {
			login: (providerId, type, interaction) =>
				Effect.gen(function* () {
					const runtime = yield* models.pipe(
						Effect.mapError((error) => loginFailure(providerId)(error.reason)),
					);
					const settings = SettingsManager.create(home.agentDir, home.agentDir);
					yield* Effect.tryPromise({
						try: () =>
							runtime.login(
								providerId,
								type,
								{
									signal: interaction.signal,
									// pi asks through a Promise; this platform is the one boundary that runs the
									// Effect question and hands its result back.
									prompt: (prompt) => Effect.runPromise(interaction.prompt(prompt)),
									notify: interaction.notify,
								},
								{ getDeviceId: () => settings.getOrCreateDeviceId() },
							),
						catch: loginFailure(providerId),
					});
				}).pipe(Effect.asVoid),
			providerLogin: (providerId) =>
				models.pipe(
					Effect.mapError((error) => loginFailure(providerId)(error.reason)),
					Effect.flatMap((runtime) => {
						const provider = runtime.getProvider(providerId);
						if (provider === undefined) {
							return Effect.fail(
								new ProviderRefused({
									providerId,
									reason: `pi does not know a provider called ${providerId}`,
								}),
							);
						}
						return Effect.succeed({
							apiKey: provider.auth.apiKey?.login !== undefined,
							name: provider.name,
							oauth: provider.auth.oauth?.login !== undefined,
						});
					}),
				),
		};
		return {
			builtinModels,
			models,
			providerLogin,
			packages: (cwd: string): PiPackagesApi => {
				const settings = SettingsManager.create(cwd, home.agentDir);
				const manager = new DefaultPackageManager({
					agentDir: home.agentDir,
					cwd,
					settingsManager: settings,
				});
				return makePackages(manager, settings);
			},
			context: (cwd: string): PiContextApi => makeContext(home, cwd),
			projectTrust: makeProjectTrust(home),
			skills: (cwd: string): PiSkillsApi => makeSkills(home, cwd),
			settingsProblems: (cwd) =>
				Effect.sync(() => {
					const manager = SettingsManager.create(cwd, home.agentDir);
					return manager.drainErrors().map((problem) => {
						const view: SettingsProblem = {
							message: problem.error.message,
							scope: problem.scope,
						};
						return problem.path === undefined ? view : Object.assign(view, { path: problem.path });
					});
				}),
			settings: (cwd: string): Effect.Effect<SettingsManager> =>
				Effect.sync(() => SettingsManager.create(cwd, home.agentDir)),
			settingsPath: Effect.succeed(join(home.agentDir, "settings.json")),
		} satisfies PiConfigApi;
	}),
);
