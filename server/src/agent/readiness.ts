/**
 * Can this deployment run a turn? Asked of a model runtime built from the same home
 * and the same two files the engine uses (`agent-session-services.js`), so the answer
 * cannot drift from what a session would see. It reads pi's files and writes none;
 * a login in the deployment's shell changes the next answer.
 */
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { Readiness } from "shared";

import { authPath, modelsPath } from "../settings/store";

export const readReadiness = async (agentHome: string): Promise<Readiness> => {
	const runtime = await ModelRuntime.create({
		authPath: authPath(agentHome),
		modelsPath: modelsPath(agentHome),
	});
	const usable = runtime.getAvailableSnapshot();
	if (usable.length > 0) return { ready: true };
	return {
		ready: false,
		home: agentHome,
		detail: `No model in ${agentHome} can run a turn: no provider is configured.`,
		fix: "Open Settings, add a provider, and choose a default model.",
	};
};
