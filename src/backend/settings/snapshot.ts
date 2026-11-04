import { Context, Effect, Layer } from "effect";

import type { ProjectNotTrusted, ProjectRefused, SkillRefused } from "#protocol/errors";
import type { ConfigSnapshot } from "#protocol/settings/epsilon";
import type { EpsilonView } from "#protocol/settings/general";
import type { ProjectStatus } from "#protocol/settings/projects";

import { EpsilonSettings } from "./epsilon.ts";
import { GeneralStore } from "./general/store.ts";
import type { GeneralStoreApi } from "./general/store.ts";
import { McpService } from "./mcp/service.ts";
import type { McpServiceApi } from "./mcp/service.ts";
import { PackageService } from "./packages/service.ts";
import type { PackageServiceApi } from "./packages/service.ts";
import { ProjectService } from "./projects/service.ts";
import { ProvidersService } from "./providers/service.ts";
import type { ProvidersServiceApi } from "./providers/service.ts";
import { ReadinessService } from "./readiness/service.ts";
import type { ReadinessServiceApi } from "./readiness/service.ts";
import { SkillsService } from "./skills/service.ts";
import type { SkillsServiceApi } from "./skills/service.ts";

/**
 * One read for the settings panel: every feature's own answer, assembled, so the page
 * cannot disagree with a feature page. A project folder must be trusted first; without
 * one the snapshot is the home alone.
 */
export type ConfigSnapshotServiceApi = {
	readonly read: (
		folder: string | null,
	) => Effect.Effect<ConfigSnapshot, ProjectNotTrusted | ProjectRefused | SkillRefused>;
};

export class ConfigSnapshotService extends Context.Service<
	ConfigSnapshotService,
	ConfigSnapshotServiceApi
>()("epsilon/ConfigSnapshotService") {}

export const makeConfigSnapshotService = (deps: {
	readonly epsilon: Effect.Effect<EpsilonView>;
	readonly general: GeneralStoreApi;
	readonly providers: ProvidersServiceApi;
	readonly mcp: McpServiceApi;
	readonly packages: PackageServiceApi;
	readonly skills: SkillsServiceApi;
	readonly readiness: ReadinessServiceApi;
	readonly trust: (folder: string) => Effect.Effect<string, ProjectNotTrusted | ProjectRefused>;
	readonly project: (folder: string) => Effect.Effect<ProjectStatus, ProjectRefused>;
}): ConfigSnapshotServiceApi => {
	const read: ConfigSnapshotServiceApi["read"] = Effect.fn("Config.snapshot")(function* (folder) {
		const project =
			folder === null
				? null
				: yield* deps.trust(folder).pipe(Effect.andThen(() => deps.project(folder)));
		const [epsilon, settings, providers, mcp, mcpLive, packages, skills, readiness] =
			yield* Effect.all(
				[
					deps.epsilon,
					deps.general.read(folder),
					deps.providers.list,
					deps.mcp.list(folder),
					deps.mcp.live(folder),
					deps.packages.list(folder),
					deps.skills.list(folder),
					deps.readiness.read,
				] as const,
				{ concurrency: "unbounded" },
			);
		return {
			folder,
			project,
			epsilon,
			settings,
			providers,
			mcp,
			mcpLive,
			packages,
			skills,
			readiness,
		};
	});
	return { read };
};

export const ConfigSnapshotServiceLive: Layer.Layer<
	ConfigSnapshotService,
	never,
	| EpsilonSettings
	| GeneralStore
	| ProvidersService
	| McpService
	| PackageService
	| SkillsService
	| ReadinessService
	| ProjectService
> = Layer.effect(
	ConfigSnapshotService,
	Effect.gen(function* () {
		const epsilon = yield* EpsilonSettings;
		const general = yield* GeneralStore;
		const providers = yield* ProvidersService;
		const mcp = yield* McpService;
		const packages = yield* PackageService;
		const skills = yield* SkillsService;
		const readiness = yield* ReadinessService;
		const projects = yield* ProjectService;
		return makeConfigSnapshotService({
			epsilon: epsilon.view,
			general,
			mcp,
			packages,
			project: (folder) => projects.status(folder),
			providers,
			readiness,
			skills,
			trust: (folder) => projects.trusted(folder),
		});
	}),
);
