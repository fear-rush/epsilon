import type { PackageView } from "@/api/types";

/** Where a package comes from, read off its source the way `pi install` does. */
const packageKind = (source: string): "npm" | "git" | "local" => {
	if (source.startsWith("npm:")) return "npm";
	if (/^(git:|git@|https?:|ssh:)/.test(source)) return "git";
	return "local";
};

/** The line under a package in the list: its install path, else its kind. */
export const packageLine = (entry: PackageView): string =>
	entry.installedPath ?? packageKind(entry.source);

/** The tab a scope belongs to. */
export const scopeOf = (project: string | undefined): PackageView["scope"] =>
	project === undefined ? "user" : "project";

/** The scope segment of a packages URL. Any scope that is not the project's is the home's. */
export const scopeOfSegment = (segment: string): PackageView["scope"] =>
	segment === "project" ? "project" : "user";
