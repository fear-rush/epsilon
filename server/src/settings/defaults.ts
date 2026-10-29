/**
 * The default provider and model are pi settings, and `SettingsManager` is the
 * exported writer for them. Using it keeps pi's scopes, locking and merge order
 * instead of writing settings.json by hand.
 */
import { SettingsManager } from "../agent/sdk";
import type { DefaultModel } from "shared";

const manager = (cwd: string, home: string): SettingsManager => SettingsManager.create(cwd, home);

export const readDefaultModel = (cwd: string, home: string): DefaultModel | null => {
	const settings = manager(cwd, home);
	const provider = settings.getDefaultProvider();
	const modelId = settings.getDefaultModel();
	if (provider === undefined || modelId === undefined) return null;
	return { provider, modelId };
};

export const writeDefaultModel = async (
	cwd: string,
	home: string,
	model: DefaultModel,
): Promise<void> => {
	const settings = manager(cwd, home);
	settings.setDefaultModelAndProvider(model.provider, model.modelId);
	await settings.flush();
};
