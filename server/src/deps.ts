/**
 * What every feature needs from the process, built once in `main.ts` and handed
 * to each router. No feature reads the environment or owns a singleton.
 */
import type { SessionRegistry } from "./features/conversation/registry";
import type { AgentHome } from "./platform/agent-home";

export type Deps = {
	home: AgentHome;
	/**
	 * The folder that stands for the operator's `~`, for skill folders other agents
	 * own and the `HOME` an installer child sees. The real home, except under
	 * `bun run dev`, where it is the sandbox's.
	 */
	userHome: string;
	/** The live engines. The socket and the REST routes must see the same ones. */
	engines: SessionRegistry;
};
