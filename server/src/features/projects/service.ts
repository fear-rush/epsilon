/**
 * Opening a folder as a project. A path is the one thing the browser sends that
 * names the disk, so every route resolves it here first: absolute, real, a
 * directory, outside the agent home, and under `bun run dev` inside the sandbox's
 * `~`. Trust is pi's: read and written through its exported `ProjectTrustStore`
 * (docs/DECISIONS.md, Chats and projects).
 */
import { mkdir, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

import type { AgentHome } from "../../platform/agent-home";
import { hasProjectResources, isProjectTrusted, trustProject } from "../../platform/pi";
import type { FolderListing, ProjectStatus } from "./contract";
import { isInside, projectName } from "./domain";

/** A picker level stops here; a folder with more subfolders says so. */
const MAX_FOLDERS = 500;

/** `~` and `~/x` are the operator's home; anything else must already be absolute. */
const expand = (raw: string): string => {
	const trimmed = raw.trim();
	if (trimmed === "~") return homedir();
	if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
	return trimmed;
};

/** The real directory a typed or picked path names, or a sentence saying why not. */
const realDirectory = async (raw: string): Promise<string> => {
	const path = expand(raw);
	if (!isAbsolute(path)) throw new Error(`"${raw}" is not an absolute path`);
	let real: string;
	try {
		real = await realpath(path);
	} catch {
		throw new Error(`${path} does not exist`);
	}
	if (!(await stat(real)).isDirectory()) throw new Error(`${path} is not a folder`);
	return real;
};

/**
 * Under `bun run dev`, a folder outside the sandbox's `~` is refused: pi reads
 * every `AGENTS.md` and `.agents/skills` above a project, so a project on the
 * operator's real disk would bring their configuration into the sandbox.
 */
const insideProjectsRoot = async (home: AgentHome, folder: string): Promise<void> => {
	if (home.projectsRoot === undefined) return;
	const root = await realpath(home.projectsRoot).catch(() => home.projectsRoot ?? "");
	if (!isInside(folder, root)) {
		throw new Error(
			`The dev sandbox opens only folders inside ${root}. Create the project there, or run bun run dev:host for your real folders.`,
		);
	}
};

/**
 * A folder that may hold a project. The agent home is pi's configuration, and the
 * chats folder is where chats run, so neither can be opened as a project.
 */
const resolveProjectFolder = async (home: AgentHome, raw: string): Promise<string> => {
	const folder = await realDirectory(raw);
	await insideProjectsRoot(home, folder);
	const agentHome = await realpath(home.dir).catch(() => home.dir);
	if (isInside(folder, agentHome)) {
		throw new Error("The agent home holds pi's configuration; open a project folder instead");
	}
	return folder;
};

export const projectStatus = (home: AgentHome, path: string): ProjectStatus => ({
	path,
	name: projectName(path),
	trusted: isProjectTrusted(home, path),
	hasProjectResources: hasProjectResources(path),
});

/** The status of a folder the browser named, after it passed the same checks. */
export const readProjectStatus = async (home: AgentHome, raw: string): Promise<ProjectStatus> =>
	projectStatus(home, await resolveProjectFolder(home, raw));

/** Trust one folder in pi's `trust.json`, through pi's store and its lock. */
export const trustProjectFolder = async (home: AgentHome, raw: string): Promise<ProjectStatus> => {
	const path = await resolveProjectFolder(home, raw);
	trustProject(home, path);
	return projectStatus(home, path);
};

/**
 * A trusted project folder, for a route that is about to run or configure
 * something in it. Untrusted is refused, so no engine and no settings write
 * reaches a folder the operator has not trusted.
 */
export const trustedProjectFolder = async (home: AgentHome, raw: string): Promise<string> => {
	const path = await resolveProjectFolder(home, raw);
	if (!isProjectTrusted(home, path)) throw new ProjectNotTrustedError(path);
	return path;
};

export class ProjectNotTrustedError extends Error {
	constructor(readonly path: string) {
		super(`${path} is not trusted yet. Trust the folder before anything runs in it.`);
	}
}

/**
 * One level of the folder picker, starting at the operator's home (the sandbox's
 * under `bun run dev`, which the picker cannot leave). Dot folders are included
 * only when the picker asks for them. A path to one can always be typed.
 */
export const listFolders = async (
	home: AgentHome,
	raw: string | undefined,
	includeHidden = false,
): Promise<FolderListing> => {
	const path = await realDirectory(raw ?? home.projectsRoot ?? homedir());
	await insideProjectsRoot(home, path);
	const root =
		home.projectsRoot === undefined
			? undefined
			: await realpath(home.projectsRoot).catch(() => home.projectsRoot);
	const entries = await readdir(path, { withFileTypes: true }).catch(() => {
		throw new Error(`${path} cannot be read`);
	});
	const folders = entries
		.filter((entry) => entry.isDirectory() && (includeHidden || !entry.name.startsWith(".")))
		.map((entry) => ({ name: entry.name, path: join(path, entry.name) }))
		.sort((left, right) => left.name.localeCompare(right.name));
	const parent = dirname(path);
	return {
		path,
		parent: parent === path || path === root ? null : parent,
		folders: folders.slice(0, MAX_FOLDERS),
		truncated: folders.length > MAX_FOLDERS,
	};
};

/** A new folder name is one segment: no separators, no dot-only names. */
const folderNameOf = (raw: string): string => {
	const name = raw.trim();
	if (
		name === "" ||
		name === "." ||
		name === ".." ||
		name.includes("/") ||
		name.includes("\\") ||
		name.includes("\0")
	)
		throw new Error(`"${raw}" is not a folder name`);
	return name;
};

/** Create one folder under an existing folder, and answer its real path. */
export const createFolder = async (
	home: AgentHome,
	parent: string,
	raw: string,
): Promise<{ path: string }> => {
	const base = await realDirectory(parent);
	await insideProjectsRoot(home, base);
	const name = folderNameOf(raw);
	const path = join(base, name);
	try {
		await mkdir(path);
	} catch (error) {
		const code = error instanceof Error && "code" in error ? String(error.code) : "";
		if (code === "EEXIST") throw new Error(`${name} already exists in ${base}`);
		throw error;
	}
	return { path: await realpath(path) };
};

/**
 * The folder a settings read or write runs from. Without a project it is the
 * chats folder, which holds no `.pi`: pi then reads and writes the home alone,
 * which is exactly what a chat sees. A project must be trusted first.
 */
export const settingsFolder = (home: AgentHome, project: string | undefined): Promise<string> =>
	project === undefined ? Promise.resolve(home.chatsDir) : trustedProjectFolder(home, project);
