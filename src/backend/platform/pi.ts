import { join } from "node:path";

import {
	DefaultPackageManager,
	ProjectTrustStore,
	SettingsManager,
	ModelRuntime,
	hasTrustRequiringProjectResources,
} from "@earendil-works/pi-coding-agent";
import type { PackageSource, ResolvedPaths } from "@earendil-works/pi-coding-agent";
import { Context, Effect, Layer } from "effect";

import type { SettingsProblem } from "#protocol/config/general";
import { PackageFailed, ProjectRefused } from "#protocol/errors";

import { AgentHome } from "./agent-home.ts";
import type { AgentHomeApi } from "./agent-home.ts";
import { RuntimeUnavailable } from "./errors.ts";

/**
 * The only place Epsilon's backend imports pi's configuration exporters.
 *
 * Every reader here takes the directory it works on. That matters: pi's defaults fall
 * back to `getAgentDir()`, which reads `PI_CODING_AGENT_DIR`, so a forgotten argument
 * would silently point at the operator's real home while a test believes it is on a
 * scratch one. (MCP is the exception that forces `main.ts` to export that variable: its
 * config loader takes no directory. See `docs/pi-sdk.md`.)
 */

/** pi's own types, re-exported so no other backend file imports the package. */
export type { SettingsManager } from "@earendil-works/pi-coding-agent";
export type { ModelRuntime } from "@earendil-works/pi-coding-agent";
export type { PackageSource, ResolvedPaths } from "@earendil-works/pi-coding-agent";

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
		return {
			builtinModels,
			models,
			packages: (cwd: string): PiPackagesApi => {
				const settings = SettingsManager.create(cwd, home.agentDir);
				const manager = new DefaultPackageManager({
					agentDir: home.agentDir,
					cwd,
					settingsManager: settings,
				});
				return makePackages(manager, settings);
			},
			projectTrust: makeProjectTrust(home),
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
