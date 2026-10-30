/**
 * Can this deployment run a turn? Asked of a model runtime built from the same home
 * and the same two files the engine uses (`agent-session-services.js`), so the answer
 * cannot drift from what a session would see. It reads pi's files and writes none;
 * a login in the deployment's shell changes the next answer.
 */
import type { Readiness } from "shared";

import type { AgentHome } from "../../platform/agent-home";
import { modelRuntime } from "../../platform/pi";

export const readReadiness = async (home: AgentHome): Promise<Readiness> => {
	const runtime = await modelRuntime(home);
	const usable = runtime.getAvailableSnapshot();
	if (usable.length > 0) return { ready: true };
	return {
		ready: false,
		home: home.dir,
		detail: "No provider is configured.",
		fix: "Add one in Settings and choose a default model.",
	};
};
