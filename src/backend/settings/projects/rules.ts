import { basename } from "node:path";

/**
 * Pure rules for projects: the name a folder is shown under. No I/O, so the trust page,
 * the picker and the engine registry agree. "Inside a folder" is
 * `platform/paths.ts`, shared with a session delete.
 */

/** The folder's own name, or the path itself for the filesystem root. */
export const projectName = (path: string): string => basename(path) || path;
