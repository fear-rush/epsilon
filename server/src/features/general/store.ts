/**
 * pi's default model and the model scope, read and written through pi's own
 * manager. The rest of the dashboard's settings writes live in `write.ts`, which
 * uses the matching setter or merges into `settings.json`.
 */
import type { AgentHome } from "../../platform/agent-home";
import { globalSettings } from "../../platform/pi";
import type { DefaultModel } from "./contract";

/** The home's default; a project's `.pi/settings.json` may still override it there. */
export const readDefaultModel = (home: AgentHome): DefaultModel | null => {
	const settings = globalSettings(home);
	const provider = settings.getDefaultProvider();
	const modelId = settings.getDefaultModel();
	if (provider === undefined || modelId === undefined) return null;
	return { provider, modelId };
};

export const writeDefaultModel = async (home: AgentHome, model: DefaultModel): Promise<void> => {
	const settings = globalSettings(home);
	settings.setDefaultModelAndProvider(model.provider, model.modelId);
	await settings.flush();
};

/** pi's model scope on its own; its getter never throws. */
export const readEnabledModels = (home: AgentHome): string[] | null =>
	globalSettings(home).getEnabledModels() ?? null;
