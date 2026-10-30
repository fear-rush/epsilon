/**
 * Packages are declared in pi's settings and installed by its own manager. Both
 * the install and the settings write are exported, so the panel calls them
 * instead of copying `pi install` (docs/reference/pi-sdk.md).
 */
import type { PackageView } from "shared";

import type { AgentHome } from "../../platform/agent-home";
import { packageManager } from "../../platform/pi";

export const listPackages = (projectDir: string, home: AgentHome): PackageView[] =>
	packageManager(projectDir, home)
		.listConfiguredPackages()
		.map((entry) => ({
			source: entry.source,
			scope: entry.scope,
			installedPath: entry.installedPath,
		}));

export const installPackage = async (
	projectDir: string,
	home: AgentHome,
	source: string,
): Promise<void> => {
	await packageManager(projectDir, home).installAndPersist(source);
};

export const removePackage = async (
	projectDir: string,
	home: AgentHome,
	source: string,
): Promise<boolean> => packageManager(projectDir, home).removeAndPersist(source);
