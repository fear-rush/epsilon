/**
 * One read for the settings panel: the files, pi's runtime view of them, and the
 * model catalog. Everything here is derived from disk at call time, so a change
 * made in a terminal shows up on the next open.
 */
import type { SettingsSnapshot } from "shared";

import { readModelsFrom } from "../agent/models";
import { readDefaultModel } from "./defaults";
import { listMcpServers } from "./mcp";
import { listPackages } from "./packages";
import { createRuntime, listBuiltins, listProviders } from "./providers";
import { listSkills } from "./skills";

export const readSettings = async (cwd: string, home: string): Promise<SettingsSnapshot> => {
	const runtime = await createRuntime(home);
	const [providers, builtins, models, mcp, skills] = await Promise.all([
		listProviders(home, runtime),
		listBuiltins(home, runtime),
		readModelsFrom(runtime),
		listMcpServers(home),
		listSkills(home),
	]);
	return {
		home,
		defaultModel: readDefaultModel(cwd, home),
		providers,
		builtins,
		models,
		mcp,
		skills,
		packages: listPackages(cwd, home),
		ready: models.length > 0,
		error: runtime.getError(),
	};
};
