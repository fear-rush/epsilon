/**
 * The default provider and model are pi settings, and `SettingsManager` is the
 * exported writer for them. Using it keeps pi's scopes, locking and merge order
 * instead of writing settings.json by hand.
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
