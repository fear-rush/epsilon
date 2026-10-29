/**
 * One read for the settings panel: the files, pi's runtime view of them, and the
 * model catalog. Everything here is derived from disk at call time, so a change
 * made in a terminal shows up on the next open.
 */
import type { SettingsSnapshot } from "shared";

import { readModelsFrom } from "../agent/models";
import { listMcpServers, mcpFileSchema } from "./mcp";
import { modelsFileSchema } from "./models-file";
import { listPackages } from "./packages";
import { createRuntime, listBuiltins, listProviders } from "./providers";
import { listSkills } from "./skills";
import { mcpPath, modelsPath, unreadableFile } from "./store";
import { readDefaultModel } from "./defaults";

/** A file the panel had to skip, plus what pi's runtime could not compose. */
const problemText = async (
	home: string,
	runtimeError: string | undefined,
): Promise<string | undefined> => {
	const problems = [
		...(await Promise.all([
			unreadableFile(modelsPath(home), modelsFileSchema),
			unreadableFile(mcpPath(home), mcpFileSchema),
		])),
	];
	const text = [runtimeError, ...problems].filter((part) => part !== undefined).join("\n\n");
	return text === "" ? undefined : text;
};

export const readSettings = async (cwd: string, home: string): Promise<SettingsSnapshot> => {
	const runtime = await createRuntime(home);
	const [providers, builtins, models, mcp, skills, packages, error] = await Promise.all([
		listProviders(home, runtime),
		listBuiltins(home, runtime),
		readModelsFrom(runtime),
		listMcpServers(home),
		listSkills(home),
		listPackages(cwd, home),
		problemText(home, runtime.getError()),
	]);
	return {
		home,
		defaultModel: readDefaultModel(cwd, home),
		providers,
		builtins,
		models,
		mcp,
		skills,
		packages,
		ready: models.length > 0,
		error,
	};
};
