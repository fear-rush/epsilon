/**
 * Whether this deployment's settings turn the built-in MCP extension off.
 *
 * pi resolves the built-ins named in `settings.extensions` (global and, for a
 * trusted project, project) through `DefaultPackageManager`, which the SDK
 * exports. Passing `builtinExtensions: ["mcp"]` and skipping every missing
 * package asks pi that one question: what `-builtin:mcp` and a project
 * `+builtin:mcp` resolve to. No package is installed or looked up.
 */
import { DefaultPackageManager, SettingsManager } from "../agent/sdk";

export const isMcpTurnedOff = async (cwd: string, home: string): Promise<boolean> => {
	try {
		const manager = new DefaultPackageManager({
			cwd,
			agentDir: home,
			settingsManager: SettingsManager.create(cwd, home),
			builtinExtensions: ["mcp"],
		});
		const resolved = await manager.resolve(async () => "skip" as const);
		return resolved.extensions.find((entry) => entry.path === "builtin:mcp")?.enabled === false;
	} catch {
		// ponytail: a broken package source must not take the whole settings page
		// down. The panel then misses the notice; the session loader reports the
		// package error itself.
		return false;
	}
};
