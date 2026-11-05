import { join } from "node:path";

import { Context, Layer } from "effect";

/**
 * The one place Epsilon decides which agent home it drives.
 *
 * `main.ts` chooses it once, from `EPSILON_AGENT_HOME` or pi's default, and passes this
 * service down. Nothing else reads the environment, so a test home and the operator's
 * home cannot be mixed by accident. pi itself reads `PI_CODING_AGENT_DIR`, so `main.ts`
 * exports that variable once for the readers that take no directory (MCP).
 */
export type AgentHomeApi = {
	/** The pi agent home: settings, auth, models, sessions, skills, MCP. */
	readonly agentDir: string;
	/** The user home that a spawned pi or engine should see as `HOME`. */
	readonly userHome: string;
	/** The folder a plain chat runs in; a project chat runs in the project. */
	readonly chatsDir: string;
	/** pi's session files, one folder per project; the index's walk root. */
	readonly sessionsDir: string;
	/** Epsilon's own directory inside the home: settings, logs, crashes, the index. */
	readonly epsilonDir: string;
	/**
	 * The folder a project may be opened from, when a sandbox sets one: the dev server
	 * sees its own `~`, so a folder on the operator's real disk is refused. Absent
	 * means the operator's own folders are the picker's range.
	 */
	readonly projectsRoot?: string;
};

export class AgentHome extends Context.Service<AgentHome, AgentHomeApi>()("epsilon/AgentHome") {}

export const makeAgentHome = (
	agentDir: string,
	userHome: string,
	projectsRoot?: string,
): AgentHomeApi => {
	const home: AgentHomeApi = {
		agentDir,
		chatsDir: join(agentDir, "chats"),
		epsilonDir: join(agentDir, ".epsilon"),
		sessionsDir: join(agentDir, "sessions"),
		userHome,
	};
	return projectsRoot === undefined ? home : { ...home, projectsRoot };
};

/** The composition-root layer: the chosen home, provided once. */
export const AgentHomeLive = (
	agentDir: string,
	userHome: string,
	projectsRoot?: string,
): Layer.Layer<AgentHome> =>
	Layer.succeed(AgentHome, makeAgentHome(agentDir, userHome, projectsRoot));
