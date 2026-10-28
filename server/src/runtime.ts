/**
 * The process-wide live-child registry. The socket and the REST routes must see
 * the same children, so the instance is created once here, not per handler.
 */
import { SessionRegistry } from "./agent/registry";
import { config } from "./config";

export const registry = new SessionRegistry({
	cwd: config.projectDir,
	agentHome: config.agentHome,
});
