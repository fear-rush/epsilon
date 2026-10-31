/**
 * One read for the settings panel: the files, pi's runtime view of them, and the
 * model catalog. Everything here is derived from disk at call time, so a change
 * made in a terminal shows up on the next open.
 */

import type { AgentHome } from "../../platform/agent-home";
import { modelRuntime } from "../../platform/pi";
import { readModelsFrom } from "../conversation";
import type { SessionRegistry } from "../conversation";
import { readDefaultModel } from "../general";
import { isMcpTurnedOff, listMcpServers } from "../mcp";
import { listPackages } from "../packages";
import { projectStatus } from "../projects";
import { listBuiltins, listProviders, modelsDocument } from "../providers";
import { listForeignSkills, listSkills, untrustedSkills } from "../skills";
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

/**
 * `folder` is the picked project, or the chats folder for the home alone (see
 * `settingsFolder`). Project rows appear only when a project is picked.
 */
export const readSettings = async (
	folder: string,
	home: AgentHome,
	userHome: string,
	engines: SessionRegistry,
): Promise<SettingsSnapshot> => {
	const project = folder === home.chatsDir ? null : projectStatus(home, folder);
	const runtime = await modelRuntime(home);
	const [providers, builtins, models, mcp, mcpDisabled, skills, packages] = await Promise.all([
		listProviders(home, runtime),
		listBuiltins(home, runtime),
		readModelsFrom(runtime),
		listMcpServers(home, folder),
		isMcpTurnedOff(folder, home),
		listSkills(folder, home, project === null ? null : folder),
		listPackages(folder, home),
	]);
	return {
		home: home.dir,
		defaultModel: readDefaultModel(home),
		project,
		providers,
		builtins,
		models,
		mcp: mcp.servers,
		mcpReach: mcp.reach,
		mcpLive: engines.mcpLive(mcp.servers.map((server) => server.name)),
		mcpDisabled,
		skills: project !== null && !project.trusted ? await untrustedSkills(folder) : skills,
		foreignSkills: listForeignSkills(folder, home, userHome, project === null ? null : folder),
		packages,
		ready: models.length > 0,
		error: await problemText(home, runtime.getError(), mcp.error),
	};
};
