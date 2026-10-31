/**
 * Turns what the browser hands over, a folder picked in a dialog or a folder dropped
 * on the page, into the flat list of files the upload sends. Paths stay relative to
 * the folder's parent, so the picked folder's own name is the first segment, which is
 * how the server names the source and finds `SKILL.md` below it.
 */
import { IMPORT_MAX_UPLOAD_BYTES, isStrippedPath, uploadPathIssues } from "shared";

export type PickedFile = { file: File; path: string };

/** A folder read in the browser: what will upload, what was left out, what is wrong. */
export type PickedFolder = {
	files: PickedFile[];
	/** `.git`, `node_modules` and OS litter, left out so they never cross the wire. */
	omitted: string[];
	issues: string[];
};

const ARCHIVE_NAME = /\.(zip|tar|tgz|tar\.gz)$/i;

/** The files of a folder picked with `<input webkitdirectory>`. */
export const filesOfInput = (list: FileList): PickedFile[] =>
	Array.from(list, (file) => ({ file, path: file.webkitRelativePath || file.name }));

const readEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
	new Promise((resolve, reject) => reader.readEntries(resolve, reject));

const fileOf = (entry: FileSystemFileEntry): Promise<File> =>
	new Promise((resolve, reject) => entry.file(resolve, reject));

/** A directory lists in batches; keep asking until it answers with none. */
const childrenOf = async (entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
	const reader = entry.createReader();
	const all: FileSystemEntry[] = [];
	for (;;) {
		const batch = await readEntries(reader);
		if (batch.length === 0) return all;
		all.push(...batch);
	}
};

const isFileEntry = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile;
const isDirectoryEntry = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry =>
	entry.isDirectory;

/**
 * Walks one dropped entry. A directory the import drops anyway is not entered, so a
 * dropped repository does not read its whole `.git`. `omitted` collects those names.
 */
const walk = async (
	entry: FileSystemEntry,
	into: PickedFile[],
	omitted: string[],
): Promise<void> => {
	const path = entry.fullPath.replace(/^\/+/, "");
	if (isStrippedPath(path)) {
		omitted.push(path);
		return;
	}
	if (isFileEntry(entry)) {
		into.push({ file: await fileOf(entry), path });
	} else if (isDirectoryEntry(entry)) {
		for (const child of await childrenOf(entry)) await walk(child, into, omitted);
	}
};

/**
 * The files of a drop. The entries are read from the event synchronously, because the
 * browser empties the transfer once the handler yields.
 */
export const filesOfDrop = (transfer: DataTransfer): Promise<PickedFolder> => {
	const entries = Array.from(transfer.items, (item) => item.webkitGetAsEntry()).filter(
		(entry) => entry !== null,
	);
	return (async () => {
		const files: PickedFile[] = [];
		const omitted: string[] = [];
		for (const entry of entries) await walk(entry, files, omitted);
		return checkFolder(files, omitted);
	})();
};

/** The top-level names a folder upload leaves out, shown instead of every nested path. */
const outermost = (path: string): string => {
	const parts = path.split("/");
	const at = parts.findIndex((_, index) => isStrippedPath(parts.slice(0, index + 1).join("/")));
	return at < 0 ? path : (parts[at] ?? path);
};

/** Drops what the import drops and checks the limits, before a byte uploads. */
export const checkFolder = (picked: readonly PickedFile[], omitted: readonly string[] = []) => {
	const files = picked.filter((entry) => !isStrippedPath(entry.path));
	const left = [
		...new Set([
			...omitted.map((path) => outermost(path).split("/").at(-1) ?? path),
			...picked.filter((entry) => isStrippedPath(entry.path)).map((e) => outermost(e.path)),
		]),
	];
	const issues: string[] = [];
	if (files.length === 0) issues.push("The folder has no files to import.");
	const bytes = files.reduce((sum, entry) => sum + entry.file.size, 0);
	if (bytes > IMPORT_MAX_UPLOAD_BYTES) {
		issues.push(
			`The folder is ${Math.ceil(bytes / 1024 / 1024)} MB; an upload is at most ${IMPORT_MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
		);
	}
	issues.push(...uploadPathIssues(files.map((entry) => entry.path)).map((i) => i.message));
	return { files, omitted: left, issues } satisfies PickedFolder;
};

/** Why one archive cannot be uploaded, or undefined when it can. */
export const archiveProblem = (file: File): string | undefined => {
	if (!ARCHIVE_NAME.test(file.name)) return `${file.name} is not a .zip, .tar, .tar.gz or .tgz`;
	if (file.size > IMPORT_MAX_UPLOAD_BYTES) {
		return `${file.name} is ${Math.ceil(file.size / 1024 / 1024)} MB; an upload is at most ${IMPORT_MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
	}
	return undefined;
};

export const formatBytes = (bytes: number): string =>
	bytes < 1024
		? `${bytes} B`
		: bytes < 1024 * 1024
			? `${(bytes / 1024).toFixed(1)} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;
