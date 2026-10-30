/**
 * What every feature needs from the process, built once in `main.ts` and handed
 * to each router. No feature reads the environment or owns a singleton.
 */
import type { SessionRegistry } from "./features/conversation/registry";
import type { AgentHome } from "./platform/agent-home";

export type Deps = {
	home: AgentHome;
	/** Where the agent runs, and therefore which pi sessions belong to this page. */
	projectDir: string;
	/** The live engines. The socket and the REST routes must see the same ones. */
	engines: SessionRegistry;
};
