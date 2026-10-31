/**
 * Packages are declared in pi's settings and installed by its own manager. Both
 * the install and the settings write are exported, so the panel calls them
 * instead of copying `pi install` (docs/pi-sdk.md). pi's `local` flag is the
 * project scope, `pi install -l`.
 */

import type { AgentHome } from "../../platform/agent-home";
import { packageManager, resolveAllResources } from "../../platform/pi";
import type { ResolvedResource } from "../../platform/pi";
import { basename, dirname, extname } from "node:path";
import type { PackageResources, PackageScope, PackageView } from "./contract";

export const listPackages = (folder: string, home: AgentHome): PackageView[] =>
	packageManager(folder, home)
		.listConfiguredPackages()
		.map((entry) => ({
			source: entry.source,
			scope: entry.scope,
			installedPath: entry.installedPath,
		}));

export const installPackage = async (
	folder: string,
	home: AgentHome,
	source: string,
	scope: PackageScope,
): Promise<void> => {
	await packageManager(folder, home).installAndPersist(source, { local: scope === "project" });
};

export const removePackage = async (
	folder: string,
	home: AgentHome,
	source: string,
	scope: PackageScope,
): Promise<boolean> =>
	packageManager(folder, home).removeAndPersist(source, { local: scope === "project" });

const nameOf = (path: string): string =>
	basename(path) === "SKILL.md" ? basename(dirname(path)) : basename(path, extname(path));

/**
 * What one declared package provides, grouped from pi's resolver by the source in
 * each resource's metadata. Reading never installs a missing package.
 */
export const packageResources = async (
	folder: string,
	home: AgentHome,
	source: string,
	scope: PackageScope,
): Promise<PackageResources> => {
	const resolved = await resolveAllResources(folder, home);
	const pick = (list: ResolvedResource[]) =>
		list
			.filter(
				(entry) =>
					entry.metadata.origin === "package" &&
					entry.metadata.source === source &&
					entry.metadata.scope === scope,
			)
			.map((entry) => ({
				path: entry.path,
				name: nameOf(entry.path),
				enabled: entry.enabled,
			}));
	return {
		extensions: pick(resolved.extensions),
		skills: pick(resolved.skills),
		prompts: pick(resolved.prompts),
		themes: pick(resolved.themes),
	};
};
