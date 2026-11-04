import { unzipSync } from "fflate";

import { LocalRefused } from "@/core/errors";

/** One file on its way to the server, named by its path inside the picked source. */
export type PickedFile = { readonly name: string; readonly bytes: Uint8Array };

/** The files a pick produced, and the ones the rules dropped. */
export type PickedSet = {
	readonly files: PickedFile[];
	readonly omitted: string[];
};

/** The limits the server also enforces; the browser refuses before spending the upload. */
export const IMPORT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Version control, dependencies and OS litter never enter a skill. */
const STRIPPED = new Set([".git", "node_modules", ".DS_Store", "__MACOSX"]);

const isStripped = (path: string): boolean =>
	path.split("/").some((segment) => STRIPPED.has(segment) || segment.startsWith("._"));

/** Why a relative path cannot be written inside a skill folder, or undefined when it can. */
const pathProblem = (path: string): string | undefined => {
	if (path === "") return "A file has no name";
	if (path.includes("\0")) return `${JSON.stringify(path)} contains a null byte`;
	if (path.includes("\\")) return `${path} uses a backslash; use / between folders`;
	if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return `${path} is an absolute path`;
	const segments = path.split("/");
	if (segments.includes("..")) return `${path} climbs out of its folder`;
	if (segments.includes("") || segments.includes("."))
		return `${path} is not a clean relative path`;
	return undefined;
};

const bytesOf = async (file: File): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer());

/** A zip fflate cannot open is the picker's refusal, not a crash. */
const unzip = (bytes: Uint8Array): Record<string, Uint8Array> => {
	try {
		return unzipSync(bytes);
	} catch {
		throw new LocalRefused({ reason: "This file is not a zip archive Epsilon can open." });
	}
};

/** A file input, whether it picked one archive or a whole folder. */
export const pickedFiles = async (input: FileList | null): Promise<PickedSet> => {
	const list = input === null ? [] : [...input];
	const read = await Promise.all(
		list.map(async (file) => ({
			// Browsers hand a picked folder's files their path in `webkitRelativePath`.
			bytes: await bytesOf(file),
			name: file.webkitRelativePath === "" ? file.name : file.webkitRelativePath,
		})),
	);
	const files: PickedFile[] = [];
	const omitted: string[] = [];
	for (const file of read) {
		if (isStripped(file.name)) {
			omitted.push(file.name);
			continue;
		}
		const problem = pathProblem(file.name);
		if (problem !== undefined) throw new LocalRefused({ reason: problem });
		files.push(file);
	}
	return { files, omitted };
};

/** A zip archive: every file binary it holds, paths already relative to its root. */
export const archiveFiles = (bytes: Uint8Array): PickedSet => {
	const entries = unzip(bytes);
	const files: PickedFile[] = [];
	const omitted: string[] = [];
	for (const [name, data] of Object.entries(entries)) {
		if (name.endsWith("/")) continue;
		if (isStripped(name)) {
			omitted.push(name);
			continue;
		}
		const problem = pathProblem(name);
		if (problem !== undefined) throw new LocalRefused({ reason: problem });
		files.push({ bytes: data, name });
	}
	return { files, omitted };
};

/** Refuses an upload over the limit before it starts. */
export const checkSize = (files: ReadonlyArray<PickedFile>): void => {
	const total = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
	if (total > IMPORT_MAX_UPLOAD_BYTES) {
		throw new LocalRefused({
			reason: `The folder is ${Math.round(total / 1024 / 1024)} MB; the limit is ${
				IMPORT_MAX_UPLOAD_BYTES / 1024 / 1024
			} MB`,
		});
	}
};

export const formatBytes = (bytes: number): string =>
	bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
