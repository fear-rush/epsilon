/**
 * Packages are declared in pi's settings and installed by its own manager. Both
 * the install and the settings write are exported, so the panel calls them
 * instead of copying `pi install` (docs/reference/pi-sdk.md).
 */
import { DefaultPackageManager, SettingsManager } from "../agent/sdk";
import type { PackageView } from "shared";

const manager = (cwd: string, home: string): DefaultPackageManager =>
	new DefaultPackageManager({
		cwd,
		agentDir: home,
		settingsManager: SettingsManager.create(cwd, home),
	});

export const listPackages = (cwd: string, home: string): PackageView[] =>
	manager(cwd, home)
		.listConfiguredPackages()
		.map((entry) => ({
			source: entry.source,
			scope: entry.scope,
			installedPath: entry.installedPath,
		}));

export const installPackage = async (cwd: string, home: string, source: string): Promise<void> => {
	await manager(cwd, home).installAndPersist(source);
};

export const removePackage = async (cwd: string, home: string, source: string): Promise<boolean> =>
	manager(cwd, home).removeAndPersist(source);
