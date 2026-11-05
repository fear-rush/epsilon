import { dirname, join, resolve } from "node:path";

import { Context, Effect, FileSystem, Layer, Option, Schema } from "effect";

import { SkillRefused } from "#protocol/errors";
import type { ProjectNotTrusted, ProjectRefused } from "#protocol/errors";
import type {
	SkillDocument,
	SkillEngineLive,
	SkillField,
	SkillFile,
	SkillBundleList,
	SkillInput,
	SkillListView,
	SkillRoot,
	SkillView,
} from "#protocol/settings/skills";
import { ExtensionSkillsAnswer } from "#protocol/settings/skills";

import { withDefined } from "../../../domain/object.ts";
import {
	SKILL_FILE_NAME,
	foreignBodySyntax,
	isSkillName,
	skillDescriptionProblem,
	skillFieldOwner,
} from "../../../domain/skills/rules.ts";
import { Engines } from "../../conversation/registry.ts";
import { AgentHome } from "../../platform/agent-home.ts";
import type { AgentHomeApi } from "../../platform/agent-home.ts";
import { PiConfig } from "../../platform/pi.ts";
import type { PiSkillsApi } from "../../platform/pi.ts";
import { ProjectService } from "../projects/service.ts";
import {
	createSkillBundleFolder,
	deleteSkillBundleFile,
	deleteSkillBundleFolder,
	listListedSkillFiles,
	listSkillFiles,
	readListedSkillFile,
	readSkillBundleFile,
	writeSkillBundleFile,
} from "./files.ts";
import { listForeignSkills, setForeignFolderLinked } from "./foreign.ts";
import type { ForeignDeps } from "./foreign.ts";
import {
	emptySkillDocument,
	parseSkillFile,
	serializeSkillFile,
	stringMapField,
	textField,
	yamlText,
} from "./frontmatter.ts";
import {
	homeSkillsDir,
	listSkills,
	projectAgentsSkillsDir,
	projectSkillsDir,
	userAgentsSkillsDir,
} from "./inventory.ts";

/**
 * Skills over pi's own resolver, loader and `skills` setting.
 *
 * A skill is a directory with a `SKILL.md`, so Epsilon writes plain files. A save goes
 * through the file's YAML document, keeping keys and comments the panel does not manage;
 * a file whose frontmatter does not parse is read as raw text and never rewritten. Every
 * name arrives from the wire, so it is checked as a directory name and resolved against
 * the skills root before any file is touched.
 */

/** The longest `SKILL.md` Raw opens or writes. */
const RAW_MAX_BYTES = 1024 * 1024;

const refused = (path: string | undefined, reason: string): SkillRefused =>
	new SkillRefused(path === undefined ? { reason } : { path, reason });

const failure = (cause: unknown): SkillRefused =>
	cause instanceof Error ? refused(undefined, cause.message) : refused(undefined, String(cause));

/** A path and its scope: the home's own settings or the trusted project's. */
type SkillScopeInfo = {
	readonly cwd: string;
	readonly project: string | null;
};

const settingsBaseDir = (home: AgentHomeApi, project: string | null): string =>
	project === null ? home.agentDir : join(project, ".pi");

/** The folder a root names; project roots need a project, which `scopeOf` already trusted. */
const rootDir = (
	home: AgentHomeApi,
	scope: SkillScopeInfo,
	root: SkillRoot,
): Effect.Effect<string, SkillRefused> => {
	if (root === "home") return Effect.succeed(homeSkillsDir(home));
	if (root === "user-agents") return Effect.succeed(userAgentsSkillsDir(home));
	if (root === "project-pi") {
		return scope.project === null
			? Effect.fail(refused(undefined, "Pick a project to use its .pi/skills"))
			: Effect.succeed(projectSkillsDir(scope.project));
	}
	return scope.project === null
		? Effect.fail(refused(undefined, "Pick a project to use its .agents/skills"))
		: Effect.succeed(projectAgentsSkillsDir(scope.project));
};

const MISSING = Symbol("missing");

/** A file's text, or a marker when there is no file. A permission error is not "missing". */
const readText = (
	fs: FileSystem.FileSystem,
	path: string,
): Effect.Effect<string | typeof MISSING, SkillRefused> =>
	fs.readFileString(path).pipe(
		Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(MISSING)),
		Effect.mapError((error): SkillRefused => failure(error)),
	);

/** A lstat, or a marker when the path is not there. */
const lstat = (fs: FileSystem.FileSystem, path: string) =>
	fs.lstat(path).pipe(
		Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(MISSING)),
		Effect.mapError((error): SkillRefused => failure(error)),
	);

/** The real path of a folder Epsilon edits, for a symlink a skills CLI made. */
const realOrSelf = (fs: FileSystem.FileSystem, path: string): Effect.Effect<string> =>
	fs.realPath(path).pipe(Effect.orElseSucceed(() => resolve(path)));

/**
 * The skill's own directory: a direct child of the root, and a link only when it points
 * into one of the skills folders Epsilon edits. A save for a new skill passes
 * `mustExist: false`, so the directory may not be there yet.
 */
const skillDirectory = (
	deps: { readonly fs: FileSystem.FileSystem; readonly home: AgentHomeApi },
	root: string,
	name: string,
	mustExist: boolean,
): Effect.Effect<string, SkillRefused> =>
	Effect.gen(function* () {
		if (!isSkillName(name)) {
			return yield* refused(name, `"${name}" is not a skill directory name`);
		}
		const base = resolve(root);
		const directory = resolve(base, name);
		if (dirname(directory) !== base) {
			return yield* refused(name, `"${name}" is not a skill directory name`);
		}
		const info = yield* lstat(deps.fs, directory);
		if (info === MISSING) {
			if (!mustExist) return directory;
			return yield* refused(directory, `No skill named "${name}" in that folder`);
		}
		let real = directory;
		if (info.type === "SymbolicLink") {
			real = yield* realOrSelf(deps.fs, directory);
			const roots = yield* Effect.forEach(
				[base, homeSkillsDir(deps.home), userAgentsSkillsDir(deps.home)],
				(path) => realOrSelf(deps.fs, path),
				{ concurrency: 1 },
			);
			if (!roots.includes(dirname(real))) {
				return yield* refused(
					directory,
					`"${name}" links outside the skills folders Epsilon edits`,
				);
			}
		}
		const folder = yield* lstat(deps.fs, real);
		if (folder === MISSING || folder.type !== "Directory") {
			return yield* refused(directory, `No skill named "${name}" in that folder`);
		}
		if (!mustExist) return real;
		const skillFile = yield* lstat(deps.fs, join(real, SKILL_FILE_NAME));
		if (skillFile === MISSING || skillFile.type !== "File") {
			return yield* refused(directory, `No skill named "${name}" in that folder`);
		}
		return real;
	});

/** A `SKILL.md` as the page shows it: managed fields, the others read-only, or the raw text. */
const parseSkillDocument = (text: string, name: string, filePath: string): SkillDocument => {
	const parsed = parseSkillFile(text);
	if (!parsed.ok) {
		return {
			name,
			filePath,
			description: "",
			body: "",
			modelInvocation: true,
			fields: [],
			bodyWarnings: [],
			parseError: parsed.error,
			raw: text,
		};
	}
	const { fields, body } = parsed.file;
	const license = textField(fields["license"]);
	const compatibility = textField(fields["compatibility"]);
	const metadata = stringMapField(fields["metadata"]);
	// A managed key whose value has another shape is shown as a field instead.
	const managed = new Set(["name", "description", "disable-model-invocation"]);
	if (license !== undefined) managed.add("license");
	if (compatibility !== undefined) managed.add("compatibility");
	if (metadata !== undefined) managed.add("metadata");
	const skillBody = body.trim();
	const residue: SkillField[] = Object.entries(fields)
		.filter(([key]) => !managed.has(key))
		.map(([key, value]) => ({
			key,
			owner: skillFieldOwner(key),
			value: yamlText(value),
		}));
	return withDefined(
		withDefined(
			withDefined(
				{
					name,
					filePath,
					description: textField(fields["description"]) ?? "",
					body: skillBody,
					modelInvocation: fields["disable-model-invocation"] !== true,
					fields: residue,
					bodyWarnings: [...foreignBodySyntax(skillBody)],
				} satisfies SkillDocument,
				"license",
				license,
			),
			"compatibility",
			compatibility,
		),
		"metadata",
		metadata,
	);
};

/** Whether an override entry force-excludes this skill, however it was spelled. */
const excludes = (entry: string, base: string, dir: string): boolean => {
	if (!entry.startsWith("-")) return false;
	const target = resolve(base, entry.slice(1));
	return target === dir || dirname(target) === dir;
};

/** The raw size limit, in bytes, without loading a Buffer for the common case. */
const tooLarge = (text: string): boolean => Buffer.byteLength(text, "utf8") > RAW_MAX_BYTES;

/** Why `text` cannot be a `SKILL.md`, or undefined. */
const rawSkillProblem = (text: string): string | undefined => {
	if (tooLarge(text)) return `SKILL.md is larger than ${RAW_MAX_BYTES / 1024 / 1024} MB`;
	const parsed = parseSkillFile(text);
	if (!parsed.ok) return parsed.error;
	const description = skillDescriptionProblem(textField(parsed.file.fields["description"]) ?? "");
	return description;
};

export type SkillsServiceApi = {
	readonly list: (folder: string | null) => Effect.Effect<SkillListView, SkillRefused>;
	readonly read: (
		folder: string | null,
		root: SkillRoot,
		name: string,
	) => Effect.Effect<SkillFile, SkillRefused>;
	readonly save: (
		folder: string | null,
		root: SkillRoot,
		name: string,
		input: SkillInput,
	) => Effect.Effect<void, SkillRefused>;
	readonly remove: (
		folder: string | null,
		root: SkillRoot,
		name: string,
	) => Effect.Effect<void, SkillRefused>;
	readonly setEnabled: (
		folder: string | null,
		filePath: string,
		enabled: boolean,
	) => Effect.Effect<void, SkillRefused>;
	readonly readRaw: (
		folder: string | null,
		root: SkillRoot,
		name: string,
	) => Effect.Effect<string, SkillRefused>;
	readonly writeRaw: (
		folder: string | null,
		root: SkillRoot,
		name: string,
		text: string,
	) => Effect.Effect<void, SkillRefused>;
	readonly readDocument: (
		folder: string | null,
		filePath: string,
	) => Effect.Effect<SkillDocument, SkillRefused>;
	/** Every file and folder of a listed skill, `SKILL.md` included. */
	readonly listDocumentFiles: (
		folder: string | null,
		filePath: string,
	) => Effect.Effect<SkillBundleList, SkillRefused>;
	/** One file of a listed skill, read-only; binary and oversized files are refused. */
	readonly readDocumentFile: (
		folder: string | null,
		filePath: string,
		path: string,
	) => Effect.Effect<string, SkillRefused>;
	/** Every file and folder in one editable skill, `SKILL.md` included. */
	readonly listFiles: (
		folder: string | null,
		root: SkillRoot,
		name: string,
	) => Effect.Effect<SkillBundleList, SkillRefused>;
	/** One bundled file's text; binary, oversized and `SKILL.md` files are refused. */
	readonly readFile: (
		folder: string | null,
		root: SkillRoot,
		name: string,
		path: string,
	) => Effect.Effect<string, SkillRefused>;
	readonly writeFile: (
		folder: string | null,
		root: SkillRoot,
		name: string,
		path: string,
		text: string,
	) => Effect.Effect<void, SkillRefused>;
	readonly createFolder: (
		folder: string | null,
		root: SkillRoot,
		name: string,
		path: string,
	) => Effect.Effect<void, SkillRefused>;
	readonly deleteFile: (
		folder: string | null,
		root: SkillRoot,
		name: string,
		path: string,
	) => Effect.Effect<void, SkillRefused>;
	readonly deleteFolder: (
		folder: string | null,
		root: SkillRoot,
		name: string,
		path: string,
	) => Effect.Effect<void, SkillRefused>;
	/** Add another agent's skill folder to the `skills` setting, or take it out. */
	readonly setFolderLinked: (
		folder: string | null,
		path: string,
		linked: boolean,
	) => Effect.Effect<void, SkillRefused>;
};

export class SkillsService extends Context.Service<SkillsService, SkillsServiceApi>()(
	"epsilon/SkillsService",
) {}

export const makeSkillsService = (deps: {
	readonly home: AgentHomeApi;
	readonly fs: FileSystem.FileSystem;
	readonly skills: (cwd: string) => PiSkillsApi;
	readonly trusted: (path: string) => Effect.Effect<string, ProjectNotTrusted | ProjectRefused>;
	readonly extensionSkills: (cwd: string) => Effect.Effect<ReadonlyArray<SkillEngineLive>>;
}): SkillsServiceApi => {
	const scopeOf = (folder: string | null): Effect.Effect<SkillScopeInfo, SkillRefused> =>
		folder === null
			? Effect.succeed({ cwd: deps.home.epsilonDir, project: null })
			: deps.trusted(folder).pipe(
					Effect.map((project) => ({ cwd: project, project })),
					Effect.catchTags({
						ProjectNotTrusted: (error) =>
							Effect.fail(
								refused(
									error.path,
									`${error.path} is not trusted yet. Trust the folder before anything runs in it.`,
								),
							),
						ProjectRefused: (error) => Effect.fail(refused(error.path ?? folder, error.reason)),
					}),
				);

	const listFor = (scope: SkillScopeInfo): Effect.Effect<ReadonlyArray<SkillView>, SkillRefused> =>
		Effect.gen(function* () {
			const live = yield* deps.extensionSkills(scope.cwd);
			return yield* listSkills({
				cwd: scope.cwd,
				fs: deps.fs,
				home: deps.home,
				live,
				project: scope.project,
				skills: deps.skills(scope.cwd),
			});
		});

	/** What another agent's folders are compared against: pi's setting and the home. */
	const foreignOf = (scope: SkillScopeInfo): Effect.Effect<ForeignDeps> =>
		Effect.gen(function* () {
			const pi = deps.skills(scope.cwd);
			const user = yield* pi.entries("user");
			const project = scope.project === null ? [] : yield* pi.entries("project");
			return {
				// The folder pi resolves a relative `skills` entry against: the agent home for its
				// own setting, the project's `.pi` for the project's.
				base: settingsBaseDir(deps.home, scope.project),
				entries: (which) => (which === "user" ? user : project),
				loadFolder: pi.loadFolder,
				project: scope.project,
				userHome: deps.home.userHome,
				writeEntries: (which, entries) => pi.writeEntries(which, entries),
			};
		});

	const list: SkillsServiceApi["list"] = Effect.fn("Skills.list")(function* (folder) {
		const scope = yield* scopeOf(folder);
		const foreignSkills = listForeignSkills(yield* foreignOf(scope));
		return { foreignSkills, skills: [...(yield* listFor(scope))] };
	});

	const setFolderLinked: SkillsServiceApi["setFolderLinked"] = Effect.fn("Skills.setFolderLinked")(
		function* (folder, path, linked) {
			const scope = yield* scopeOf(folder);
			yield* setForeignFolderLinked(yield* foreignOf(scope), path, linked);
		},
	);

	const folderAt = (scope: SkillScopeInfo, root: SkillRoot, name: string, mustExist: boolean) =>
		Effect.gen(function* () {
			const rootPath = yield* rootDir(deps.home, scope, root);
			return yield* skillDirectory({ fs: deps.fs, home: deps.home }, rootPath, name, mustExist);
		});

	const read: SkillsServiceApi["read"] = Effect.fn("Skills.read")(function* (folder, root, name) {
		const scope = yield* scopeOf(folder);
		const dir = yield* folderAt(scope, root, name, true);
		const filePath = join(dir, SKILL_FILE_NAME);
		const text = yield* readText(deps.fs, filePath);
		if (text === MISSING) return yield* refused(filePath, "No such skill");
		return { root, ...parseSkillDocument(text, name, filePath) };
	});

	const save: SkillsServiceApi["save"] = Effect.fn("Skills.save")(
		function* (folder, root, name, input) {
			const description = skillDescriptionProblem(input.description);
			if (description !== undefined) return yield* refused(name, description);
			const scope = yield* scopeOf(folder);
			const dir = yield* folderAt(scope, root, name, false);
			const filePath = join(dir, SKILL_FILE_NAME);
			const existing = yield* readText(deps.fs, filePath);
			let document = emptySkillDocument();
			if (existing !== MISSING) {
				const parsed = parseSkillFile(existing);
				if (!parsed.ok) {
					return yield* refused(
						filePath,
						`${filePath} was not changed: ${parsed.error}. Fix the frontmatter by hand, then save again.`,
					);
				}
				document = parsed.file.document;
			}
			const changes: Parameters<typeof serializeSkillFile>[1] = {
				description: input.description.trim(),
				"disable-model-invocation": input.modelInvocation ? undefined : true,
			};
			// A new skill is named after the folder it created. An existing file keeps the name
			// it has, which pi allows to be absent or to differ from the folder.
			if (existing === MISSING) changes["name"] = name;
			if (input.license !== undefined) changes["license"] = input.license.trim() || undefined;
			if (input.compatibility !== undefined) {
				changes["compatibility"] = input.compatibility.trim() || undefined;
			}
			if (input.metadata !== undefined) {
				changes["metadata"] = Object.keys(input.metadata).length === 0 ? undefined : input.metadata;
			}
			const text = serializeSkillFile(document, changes, input.body);
			yield* deps.fs
				.makeDirectory(dir, { recursive: true })
				.pipe(Effect.mapError((error) => failure(error)));
			yield* deps.fs
				.writeFileString(filePath, text)
				.pipe(Effect.mapError((error) => refused(filePath, String(error))));
			return undefined;
		},
	);

	const remove: SkillsServiceApi["remove"] = Effect.fn("Skills.remove")(
		function* (folder, root, name) {
			const scope = yield* scopeOf(folder);
			const rootPath = yield* rootDir(deps.home, scope, root);
			if (!isSkillName(name)) {
				return yield* refused(name, `"${name}" is not a skill directory name`);
			}
			const directory = resolve(rootPath, name);
			if (dirname(directory) !== resolve(rootPath)) {
				return yield* refused(name, `"${name}" is not a skill directory name`);
			}
			const text = yield* readText(deps.fs, join(directory, SKILL_FILE_NAME));
			if (text === MISSING) return undefined;
			yield* deps.fs
				.remove(directory, { recursive: true })
				.pipe(Effect.mapError((error) => failure(error)));
			return undefined;
		},
	);

	const setEnabled: SkillsServiceApi["setEnabled"] = Effect.fn("Skills.setEnabled")(
		function* (folder, filePath, enabled) {
			const scope = yield* scopeOf(folder);
			const skills = deps.skills(scope.cwd);
			const skill = (yield* listFor(scope)).find((entry) => entry.filePath === filePath);
			if (skill === undefined) return yield* refused(filePath, "No such skill");
			if (skill.toggle === "package") {
				return yield* refused(
					filePath,
					`This skill comes from the package ${skill.packageSource ?? ""}. Turn it off from Packages.`,
				);
			}
			if (skill.toggle === "none") {
				return yield* refused(filePath, "This skill cannot be turned off from here");
			}
			const base = settingsBaseDir(deps.home, scope.project);
			const entries = [...(yield* skills.entries(skill.scope))];
			const rest = entries.filter((entry) => !excludes(entry, base, skill.dir));
			const next = enabled ? rest : [...rest, `-${skill.dir}`];
			if (next.length !== entries.length || next.some((entry, index) => entry !== entries[index])) {
				yield* skills.writeEntries(skill.scope, next);
			}
			if (!enabled) return undefined;
			const after = (yield* listFor(scope)).find((entry) => entry.filePath === filePath);
			if (after?.status === "disabled") {
				return yield* refused(
					filePath,
					`A pattern in the skills setting still excludes ${skill.name}. Edit settings.json to remove it.`,
				);
			}
			return undefined;
		},
	);

	const readRaw: SkillsServiceApi["readRaw"] = Effect.fn("Skills.readRaw")(
		function* (folder, root, name) {
			const scope = yield* scopeOf(folder);
			const dir = yield* folderAt(scope, root, name, true);
			const text = yield* readText(deps.fs, join(dir, SKILL_FILE_NAME));
			if (text === MISSING) return yield* refused(name, "No such skill");
			return text;
		},
	);

	const writeRaw: SkillsServiceApi["writeRaw"] = Effect.fn("Skills.writeRaw")(
		function* (folder, root, name, text) {
			const scope = yield* scopeOf(folder);
			const dir = yield* folderAt(scope, root, name, true);
			const problem = rawSkillProblem(text);
			if (problem !== undefined) {
				return yield* refused(name, `SKILL.md was not changed: ${problem}`);
			}
			yield* deps.fs
				.writeFileString(join(dir, SKILL_FILE_NAME), text)
				.pipe(Effect.mapError((error) => failure(error)));
			return undefined;
		},
	);

	/** The inventory's row for a listed skill, refused when it lists none at that path. */
	const documentAt = (
		folder: string | null,
		filePath: string,
	): Effect.Effect<SkillView, SkillRefused> =>
		Effect.gen(function* () {
			const scope = yield* scopeOf(folder);
			const listed = (yield* listFor(scope)).find((entry) => entry.filePath === filePath);
			if (listed === undefined) return yield* refused(filePath, "No such skill");
			return listed;
		});

	const readDocument: SkillsServiceApi["readDocument"] = Effect.fn("Skills.readDocument")(
		function* (folder, filePath) {
			const listed = yield* documentAt(folder, filePath);
			const text = yield* readText(deps.fs, listed.filePath);
			if (text === MISSING) return yield* refused(filePath, "No such skill");
			return parseSkillDocument(text, listed.name, listed.filePath);
		},
	);

	const listDocumentFiles: SkillsServiceApi["listDocumentFiles"] = Effect.fn(
		"Skills.listDocumentFiles",
	)(function* (folder, filePath) {
		const listed = yield* documentAt(folder, filePath);
		return yield* listListedSkillFiles(deps.fs, listed.filePath);
	});

	const readDocumentFile: SkillsServiceApi["readDocumentFile"] = Effect.fn(
		"Skills.readDocumentFile",
	)(function* (folder, filePath, path) {
		const listed = yield* documentAt(folder, filePath);
		return yield* readListedSkillFile(deps.fs, listed.filePath, path);
	});

	/** The skill folder a bundle call edits, refused unless it is an existing skill. */
	const bundleDir = (
		folder: string | null,
		root: SkillRoot,
		name: string,
	): Effect.Effect<string, SkillRefused> =>
		Effect.gen(function* () {
			const scope = yield* scopeOf(folder);
			const rootPath = yield* rootDir(deps.home, scope, root);
			return yield* skillDirectory({ fs: deps.fs, home: deps.home }, rootPath, name, true);
		});

	const listFiles: SkillsServiceApi["listFiles"] = Effect.fn("Skills.listFiles")(
		function* (folder, root, name) {
			const dir = yield* bundleDir(folder, root, name);
			return yield* listSkillFiles(deps.fs, dir);
		},
	);

	const readFile: SkillsServiceApi["readFile"] = Effect.fn("Skills.readFile")(
		function* (folder, root, name, path) {
			const dir = yield* bundleDir(folder, root, name);
			return yield* readSkillBundleFile(deps.fs, dir, path);
		},
	);

	const writeFile: SkillsServiceApi["writeFile"] = Effect.fn("Skills.writeFile")(
		function* (folder, root, name, path, text) {
			const dir = yield* bundleDir(folder, root, name);
			yield* writeSkillBundleFile(deps.fs, dir, path, text);
		},
	);

	const createFolder: SkillsServiceApi["createFolder"] = Effect.fn("Skills.createFolder")(
		function* (folder, root, name, path) {
			const dir = yield* bundleDir(folder, root, name);
			yield* createSkillBundleFolder(deps.fs, dir, path);
		},
	);

	const deleteFile: SkillsServiceApi["deleteFile"] = Effect.fn("Skills.deleteFile")(
		function* (folder, root, name, path) {
			const dir = yield* bundleDir(folder, root, name);
			yield* deleteSkillBundleFile(deps.fs, dir, path);
		},
	);

	const deleteFolder: SkillsServiceApi["deleteFolder"] = Effect.fn("Skills.deleteFolder")(
		function* (folder, root, name, path) {
			const dir = yield* bundleDir(folder, root, name);
			yield* deleteSkillBundleFolder(deps.fs, dir, path);
		},
	);

	return {
		createFolder,
		deleteFile,
		deleteFolder,
		list,
		listDocumentFiles,
		listFiles,
		read,
		readDocument,
		readDocumentFile,
		readFile,
		readRaw,
		remove,
		save,
		setEnabled,
		setFolderLinked,
		writeFile,
		writeRaw,
	};
};

export const SkillsServiceLive: Layer.Layer<
	SkillsService,
	never,
	AgentHome | PiConfig | ProjectService | Engines | FileSystem.FileSystem
> = Layer.effect(
	SkillsService,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const pi = yield* PiConfig;
		const projects = yield* ProjectService;
		const engines = yield* Engines;
		const fs = yield* FileSystem.FileSystem;
		const extensionSkills = (cwd: string): Effect.Effect<ReadonlyArray<SkillEngineLive>> =>
			engines.queryAll("extensionSkills").pipe(
				Effect.map((rows) =>
					rows
						.filter((row) => resolve(row.cwd) === resolve(cwd))
						.flatMap((row) => {
							const decoded = Schema.decodeUnknownOption(ExtensionSkillsAnswer)(row.result);
							return Option.isNone(decoded) ? [] : decoded.value.skills;
						}),
				),
			);
		return makeSkillsService({
			extensionSkills,
			fs,
			home,
			skills: (cwd) => pi.skills(cwd),
			trusted: (path) => projects.trusted(path),
		});
	}),
);
