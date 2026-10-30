/**
 * One read for the settings panel: the files, pi's runtime view of them, and the
 * model catalog. Everything here is derived from disk at call time, so a change
 * made in a terminal shows up on the next open.
 */

import type { AgentHome } from "../../platform/agent-home";
import { modelRuntime } from "../../platform/pi";
import { readModelsFrom } from "../conversation/models";
import { readDefaultModel } from "../general/defaults";
import { isMcpTurnedOff, listMcpServers } from "../mcp/service";
import { listPackages } from "../packages/service";
import { listBuiltins, listProviders } from "../providers/service";
import { modelsDocument } from "../providers/store";
import { listSkills } from "../skills/store";
import type { SettingsSnapshot } from "./contract";

/**
 * A file the panel had to skip, plus what pi's runtime could not compose. The
 * MCP listing reads both `mcp.json` files itself, so it contributes its own
 * sentences here rather than a second parse.
 */
const problemText = async (
	home: AgentHome,
	runtimeError: string | undefined,
	mcpProblem: string | undefined,
): Promise<string | undefined> => {
	const problems = [
		(await modelsDocument(home).read()).problem,
		...(mcpProblem === undefined ? [] : [mcpProblem]),
		...(runtimeError === undefined ? [] : [runtimeError]),
	];
	const text = problems.filter((part) => part !== undefined).join("\n\n");
	return text === "" ? undefined : text;
};

export const readSettings = async (
	projectDir: string,
	home: AgentHome,
): Promise<SettingsSnapshot> => {
	const runtime = await modelRuntime(home);
	const [providers, builtins, models, mcp, mcpDisabled, skills, packages] = await Promise.all([
		listProviders(home, runtime),
		listBuiltins(home, runtime),
		readModelsFrom(runtime),
		listMcpServers(home, projectDir),
		isMcpTurnedOff(projectDir, home),
		listSkills(home),
		listPackages(projectDir, home),
	]);
	return {
		home: home.dir,
		defaultModel: readDefaultModel(projectDir, home),
		projectDir,
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
