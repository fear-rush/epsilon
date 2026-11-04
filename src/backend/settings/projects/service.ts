import { dirname, isAbsolute, join } from "node:path";

import { Context, Effect, FileSystem, Layer } from "effect";

import { ProjectNotTrusted, ProjectRefused } from "#protocol/errors";
import type { SettingsProblem } from "#protocol/settings/general";
import type {
	CreatedFolder,
	FolderListing,
	ProjectStatus,
	ProjectTrustAction,
} from "#protocol/settings/projects";

import { AgentHome } from "../../platform/agent-home.ts";
import type { AgentHomeApi } from "../../platform/agent-home.ts";
import { PiConfig } from "../../platform/pi.ts";
import type { PiProjectTrustApi } from "../../platform/pi.ts";
import { isInside, projectName } from "./rules.ts";
import { decideProjectTrust } from "./trust.ts";

/**
 * Opening a folder as a project. A path is the one thing the browser sends that names
 * the disk, so every operation resolves it first: absolute, real, a directory, outside
 * the agent home, and inside the sandbox's root when one is set. Trust is pi's own
 * `trust.json`, so a terminal pi and the dashboard share decisions.
 *
 * Nothing here reads or writes a project's own `.pi` except the settings-problem check,
 * which is the documented exception that names a file pi cannot parse before trust.
 */

/** A picker level stops here; a folder with more subfolders says so. */
const MAX_FOLDERS = 500;

/** The service owns its file access; callers see only the project refusals. */
type Io<A, E = never> = Effect.Effect<A, E>;

const refused = (path: string | undefined, reason: string): ProjectRefused =>
	new ProjectRefused(path === undefined ? { reason } : { path, reason });

/** `~` and `~/x` are the operator's home; anything else must already be absolute. */
const expand = (home: AgentHomeApi, raw: string): string => {
	const trimmed = raw.trim();
	if (trimmed === "~") return home.userHome;
	if (trimmed.startsWith("~/")) return join(home.userHome, trimmed.slice(2));
	return trimmed;
};

const platformReason = (error: { readonly message: string }): string => error.message;

/** A new folder name is one segment: no separators, no dot-only names. */
const folderNameOf = (raw: string): ProjectRefused | undefined => {
	const name = raw.trim();
	if (
		name === "" ||
		name === "." ||
		name === ".." ||
		name.includes("/") ||
		name.includes("\\") ||
		name.includes("\0")
	) {
		return refused(undefined, `"${raw}" is not a folder name`);
	}
	return undefined;
};

export type ProjectServiceApi = {
	readonly status: (path: string) => Io<ProjectStatus, ProjectRefused>;
	readonly setTrust: (
		path: string,
		action: ProjectTrustAction,
	) => Io<ProjectStatus, ProjectRefused>;
	readonly folders: (
		path: string | undefined,
		hidden: boolean,
	) => Io<FolderListing, ProjectRefused>;
	readonly createFolder: (parent: string, name: string) => Io<CreatedFolder, ProjectRefused>;
	/** The real folder when pi trusts it, or the refusal the caller must show. */
	readonly trusted: (path: string) => Io<string, ProjectRefused | ProjectNotTrusted>;
};

export class ProjectService extends Context.Service<ProjectService, ProjectServiceApi>()(
	"epsilon/ProjectService",
) {}

export const makeProjectService = (deps: {
	readonly home: AgentHomeApi;
	readonly trust: PiProjectTrustApi;
	readonly fs: FileSystem.FileSystem;
	readonly settingsProblems: (cwd: string) => Effect.Effect<ReadonlyArray<SettingsProblem>>;
}): ProjectServiceApi => {
	const { fs } = deps;

	/** The real directory a typed or picked path names, or a sentence saying why not. */
	const realDirectory = (raw: string): Io<string, ProjectRefused> =>
		Effect.gen(function* () {
			const path = expand(deps.home, raw);
			if (!isAbsolute(path)) {
				return yield* refused(raw, `"${raw}" is not an absolute path`);
			}
			const real = yield* fs.realPath(path).pipe(
				Effect.catchReason("PlatformError", "NotFound", () =>
					Effect.fail(refused(path, `${path} does not exist`)),
				),
				Effect.mapError((error) =>
					error instanceof ProjectRefused ? error : refused(path, platformReason(error)),
				),
			);
			const info = yield* fs
				.stat(real)
				.pipe(Effect.mapError((error) => refused(path, platformReason(error))));
			if (info.type !== "Directory") {
				return yield* refused(path, `${path} is not a folder`);
			}
			return real;
		});

	/** The sandbox's root, when it has one, so a dev server cannot open the real disk. */
	const insideProjectsRoot = (folder: string): Io<void, ProjectRefused> => {
		const root = deps.home.projectsRoot;
		if (root === undefined) return Effect.void;
		return Effect.gen(function* () {
			const real = yield* fs.realPath(root).pipe(Effect.orElseSucceed(() => root));
			if (!isInside(folder, real)) {
				return yield* refused(
					folder,
					`The dev sandbox opens only folders inside ${real}. Create the project there, or run bun run dev:host for your real folders.`,
				);
			}
			return undefined;
		});
	};

	/**
	 * A folder that may hold a project. The agent home is pi's configuration, so it
	 * cannot be opened as a project, and neither can anything inside it.
	 */
	const resolveProjectFolder = (raw: string): Io<string, ProjectRefused> =>
		Effect.gen(function* () {
			const folder = yield* realDirectory(raw);
			yield* insideProjectsRoot(folder);
			const agentHome = yield* fs
				.realPath(deps.home.agentDir)
				.pipe(Effect.orElseSucceed(() => deps.home.agentDir));
			if (isInside(folder, agentHome)) {
				return yield* refused(
					folder,
					"The agent home holds pi's configuration; open a project folder instead",
				);
			}
			return folder;
		});

	const statusOf = (path: string): Io<ProjectStatus, ProjectRefused> =>
		Effect.gen(function* () {
			const canonical = yield* fs.realPath(path).pipe(Effect.orElseSucceed(() => path));
			const entry = yield* deps.trust.entry(path);
			const parent = dirname(canonical);
			return {
				path,
				name: projectName(path),
				trusted: yield* decideProjectTrust(deps.trust, path),
				hasProjectResources: yield* deps.trust.hasResources(path),
				decidedHere: entry === canonical,
				parent: parent === canonical ? null : parent,
			} satisfies ProjectStatus;
		});

	/** The status page's extra read: a project settings file pi cannot parse. */
	const statusWithProblems = (path: string): Io<ProjectStatus, ProjectRefused> =>
		Effect.gen(function* () {
			const status = yield* statusOf(path);
			const problems = yield* deps.settingsProblems(status.path);
			return {
				...status,
				settingsProblems: problems.filter((problem) => problem.scope === "project"),
			};
		});

	const status: ProjectServiceApi["status"] = Effect.fn("Projects.status")(function* (raw) {
		return yield* statusWithProblems(yield* resolveProjectFolder(raw));
	});

	const setTrust: ProjectServiceApi["setTrust"] = Effect.fn("Projects.setTrust")(
		function* (raw, action) {
			const path = yield* resolveProjectFolder(raw);
			switch (action) {
				case "trust":
					yield* deps.trust.write(path, true);
					break;
				case "untrust":
					yield* deps.trust.write(path, false);
					break;
				case "forget":
					yield* deps.trust.write(path, null);
					break;
				case "trust-parent": {
					const parent = dirname(path);
					if (parent === path) {
						return yield* refused(path, "The filesystem root has no parent to trust.");
					}
					yield* deps.trust.writeMany([
						{ decision: true, path: parent },
						{ decision: null, path },
					]);
					break;
				}
			}
			return yield* statusWithProblems(path);
		},
	);

	/** One level of the folder picker, starting at the operator's home. */
	const folders: ProjectServiceApi["folders"] = Effect.fn("Projects.folders")(
		function* (raw, hidden) {
			const start = raw ?? deps.home.projectsRoot ?? deps.home.userHome;
			const path = yield* realDirectory(start);
			yield* insideProjectsRoot(path);
			const root =
				deps.home.projectsRoot === undefined
					? undefined
					: yield* fs
							.realPath(deps.home.projectsRoot)
							.pipe(Effect.orElseSucceed(() => deps.home.projectsRoot ?? ""));
			const entries = yield* fs
				.readDirectoryEntries(path)
				.pipe(Effect.mapError((error) => refused(path, platformReason(error))));
			const found = entries
				.filter((entry) => entry.type === "Directory" && (hidden || !entry.name.startsWith(".")))
				.map((entry) => ({ name: entry.name, path: join(path, entry.name) }))
				.toSorted((left, right) => left.name.localeCompare(right.name));
			const parent = dirname(path);
			return {
				path,
				parent: parent === path || path === root ? null : parent,
				folders: found.slice(0, MAX_FOLDERS),
				truncated: found.length > MAX_FOLDERS,
			} satisfies FolderListing;
		},
	);

	const createFolder: ProjectServiceApi["createFolder"] = Effect.fn("Projects.createFolder")(
		function* (parent, raw) {
			const base = yield* realDirectory(parent);
			yield* insideProjectsRoot(base);
			const invalid = folderNameOf(raw);
			if (invalid !== undefined) return yield* invalid;
			const name = raw.trim();
			const path = join(base, name);
			yield* fs.makeDirectory(path).pipe(
				Effect.catchReason("PlatformError", "AlreadyExists", () =>
					Effect.fail(refused(path, `${name} already exists in ${base}`)),
				),
				Effect.mapError((error) =>
					error instanceof ProjectRefused ? error : refused(path, platformReason(error)),
				),
			);
			return { path: yield* fs.realPath(path).pipe(Effect.orElseSucceed(() => path)) };
		},
	);

	const trusted: ProjectServiceApi["trusted"] = Effect.fn("Projects.trusted")(function* (raw) {
		const path = yield* resolveProjectFolder(raw);
		if (!(yield* decideProjectTrust(deps.trust, path))) {
			return yield* new ProjectNotTrusted({ path });
		}
		return path;
	});

	return { createFolder, folders, setTrust, status, trusted };
};

export const ProjectServiceLive: Layer.Layer<
	ProjectService,
	never,
	AgentHome | PiConfig | FileSystem.FileSystem
> = Layer.effect(
	ProjectService,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const pi = yield* PiConfig;
		const fs = yield* FileSystem.FileSystem;
		return makeProjectService({
			fs,
			home,
			settingsProblems: pi.settingsProblems,
			trust: pi.projectTrust,
		});
	}),
);
