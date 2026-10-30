/**
 * One read for the settings panel: the files, pi's runtime view of them, and the
 * model catalog. Everything here is derived from disk at call time, so a change
 * made in a terminal shows up on the next open.
 */
import type { SettingsSnapshot } from "shared";

import { readModelsFrom } from "../agent/models";
import { isMcpTurnedOff, listMcpServers } from "./mcp";
import { modelsFileSchema } from "./models-file";
import { listPackages } from "./packages";
import { createRuntime, listBuiltins, listProviders } from "./providers";
import { listSkills } from "./skills";
import { modelsPath, unreadableFile } from "./store";
import { readDefaultModel } from "./defaults";

/**
 * A file the panel had to skip, plus what pi's runtime could not compose. The
 * MCP listing reads both `mcp.json` files itself, so it contributes its own
 * sentences here rather than a second parse.
 */
const problemText = async (
	home: string,
	runtimeError: string | undefined,
	mcpProblem: string | undefined,
): Promise<string | undefined> => {
	const problems = [
		await unreadableFile(modelsPath(home), modelsFileSchema),
		...(mcpProblem === undefined ? [] : [mcpProblem]),
		...(runtimeError === undefined ? [] : [runtimeError]),
	];
	const text = problems.filter((part) => part !== undefined).join("\n\n");
	return text === "" ? undefined : text;
};

export const readSettings = async (cwd: string, home: string): Promise<SettingsSnapshot> => {
	const runtime = await createRuntime(home);
	const [providers, builtins, models, mcp, mcpDisabled, skills, packages] = await Promise.all([
		listProviders(home, runtime),
		listBuiltins(home, runtime),
		readModelsFrom(runtime),
		listMcpServers(home, cwd),
		isMcpTurnedOff(cwd, home),
		listSkills(home),
		listPackages(cwd, home),
	]);
	return {
		home,
		defaultModel: readDefaultModel(cwd, home),
		projectDir: cwd,
		providers,
		builtins,
		models,
		mcp: mcp.servers,
		mcpDisabled,
		skills,
		packages,
		ready: models.length > 0,
		error: await problemText(home, runtime.getError(), mcp.error),
	};
};
