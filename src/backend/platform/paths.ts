import { relative, sep } from "node:path";

/**
 * Pure path rules shared by more than one backend feature, so the projects pages and a
 * session delete agree on what "inside" means. No I/O.
 */

/** True when `path` is `parent` or anywhere below it. */
export const isInside = (path: string, parent: string): boolean => {
	const inside = relative(parent, path);
	return inside === "" || (inside !== ".." && !inside.startsWith(`..${sep}`));
};
