/**
 * The default provider and model are pi settings, and `SettingsManager` is the
 * exported writer for them. Using it keeps pi's scopes, locking and merge order
 * instead of writing settings.json by hand.
 */
import type { DefaultModel } from "shared";

import type { AgentHome } from "../../platform/agent-home";
import { settingsManager } from "../../platform/pi";

export const readDefaultModel = (projectDir: string, home: AgentHome): DefaultModel | null => {
	const settings = settingsManager(projectDir, home);
	const provider = settings.getDefaultProvider();
	const modelId = settings.getDefaultModel();
	if (provider === undefined || modelId === undefined) return null;
	return { provider, modelId };
};

export const writeDefaultModel = async (
	projectDir: string,
	home: AgentHome,
	model: DefaultModel,
): Promise<void> => {
	const settings = settingsManager(projectDir, home);
	settings.setDefaultModelAndProvider(model.provider, model.modelId);
	await settings.flush();
};
