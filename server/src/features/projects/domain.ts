/**
 * Pure rules for places: which folder a session runs in, and what the sidebar
 * calls it. No I/O, so the session catalog and the engine registry agree.
 */
import { basename, relative, sep } from "node:path";

import type { Place } from "shared";

/** A session in the chats folder is a chat; any other folder is a project. */
export const placeOf = (cwd: string, chatsDir: string): Place =>
	cwd === chatsDir ? { kind: "chat" } : { kind: "project", path: cwd };

/** The folder's own name, or the path itself for the filesystem root. */
export const projectName = (path: string): string => basename(path) || path;

/** True when `path` is `parent` or anywhere below it. */
export const isInside = (path: string, parent: string): boolean => {
	const inside = relative(parent, path);
	return (
		inside === "" || (!inside.startsWith(`..${sep}`) && inside !== ".." && !inside.startsWith(sep))
	);
};
