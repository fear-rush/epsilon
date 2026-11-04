import { basename, relative, sep } from "node:path";

/**
 * Pure rules for projects: the name a folder is shown under, and whether a path is
 * `parent` or anywhere below it. No I/O, so the trust page, the picker and the engine
 * registry agree.
 */

/** The folder's own name, or the path itself for the filesystem root. */
export const projectName = (path: string): string => basename(path) || path;

/** True when `path` is `parent` or anywhere below it. */
export const isInside = (path: string, parent: string): boolean => {
	const inside = relative(parent, path);
	return inside === "" || (inside !== ".." && !inside.startsWith(`..${sep}`));
};
