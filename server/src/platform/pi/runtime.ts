/**
 * The model runtime, built from the agent home and nothing else. Every non-
 * conversation read of providers, credentials and the model catalog goes through
 * here, so the answer matches what the engine's own runtime would see
 * (`agent-session-services.js` builds it from the same two files).
 */
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

import type { AgentHome } from "../agent-home";

export const modelRuntime = (home: AgentHome): Promise<ModelRuntime> =>
	ModelRuntime.create({ authPath: home.authFile, modelsPath: home.modelsFile });

/**
 * A runtime with no models file, which exposes only the providers pi ships. It
 * answers "which ids are built in" independent of `models.json`.
 */
export const builtinRuntime = (home: AgentHome): Promise<ModelRuntime> =>
	ModelRuntime.create({
		authPath: home.authFile,
		modelsPath: null,
		// Only the built-in id list is needed; do not resolve credentials or refresh.
		refreshOnCreate: false,
	});
