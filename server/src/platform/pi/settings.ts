/**
 * pi's exported writers for its own settings and packages. They own scopes,
 * locking and merge order, so the dashboard calls them instead of writing
 * `settings.json` by hand (docs/DECISIONS.md, Configure in the dashboard).
 */
import { DefaultPackageManager, SettingsManager } from "@earendil-works/pi-coding-agent";

import type { AgentHome } from "../agent-home";

export const settingsManager = (projectDir: string, home: AgentHome): SettingsManager =>
	SettingsManager.create(projectDir, home.dir);

/**
 * `builtinExtensions` names built-ins to resolve as toggleable resources; none
 * by default, which is pi's own default.
 */
export const packageManager = (
	projectDir: string,
	home: AgentHome,
	builtinExtensions: string[] = [],
): DefaultPackageManager =>
	new DefaultPackageManager({
		cwd: projectDir,
		agentDir: home.dir,
		settingsManager: settingsManager(projectDir, home),
		builtinExtensions,
	});
