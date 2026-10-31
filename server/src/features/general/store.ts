/**
 * The default provider and model are pi settings, and `SettingsManager` is the
 * exported writer for them. Using it keeps pi's scopes, locking and merge order
 * instead of writing settings.json by hand.
 */

import { join } from "node:path";
import { z } from "zod";

import type { AgentHome } from "../../platform/agent-home";
import { jsonDocument } from "../../platform/json-document";
import { globalSettings } from "../../platform/pi";
import type { AgentLimits, DefaultModel } from "./contract";

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

/**
 * The three limits pi only reads. `SettingsManager` exposes setters for the two
 * booleans and the model scope, but the token numbers and the retry count have
 * getters only, so they are merged into `settings.json` under the documented
 * shape and every unknown key survives (docs/DECISIONS.md, Configure in the
 * dashboard).
 */
const numbersSchema = z.looseObject({
	compaction: z
		.looseObject({
			reserveTokens: z.number().int().min(0).optional(),
			keepRecentTokens: z.number().int().min(0).optional(),
		})
		.optional(),
	retry: z.looseObject({ maxRetries: z.number().int().min(0).optional() }).optional(),
});

type Numbers = z.infer<typeof numbersSchema>;

const numbersDocument = (home: AgentHome) =>
	jsonDocument(join(home.dir, "settings.json"), {
		schema: numbersSchema,
		empty: (): Numbers => ({}),
		policy: "private",
		wording: {
			problem: (cause, path) => `Agent settings could not be read (${cause}) from ${path}.`,
			refusal: (path, problem) =>
				`Epsilon did not write agent settings because ${path} ${problem}.`,
		},
	});

/** The resolved limits: pi merges the home and the folder, so this is what runs. */
export const readAgentLimits = (home: AgentHome): AgentLimits => {
	const settings = globalSettings(home);
	const retry = settings.getRetrySettings();
	return {
		compactionEnabled: settings.getCompactionEnabled(),
		compactionReserveTokens: settings.getCompactionReserveTokens(),
		compactionKeepRecentTokens: settings.getCompactionKeepRecentTokens(),
		retryEnabled: retry.enabled,
		retryMaxRetries: retry.maxRetries,
		enabledModels: settings.getEnabledModels() ?? null,
	};
};

/**
 * The numbers first, then pi's own writer for the rest: `SettingsManager`
 * rewrites the whole file from what it read, so it has to read after the merge
 * or it would put the old numbers back.
 */
export const writeAgentLimits = async (home: AgentHome, limits: AgentLimits): Promise<void> => {
	await numbersDocument(home).update((current) => ({
		...current,
		compaction: {
			...current.compaction,
			reserveTokens: limits.compactionReserveTokens,
			keepRecentTokens: limits.compactionKeepRecentTokens,
		},
		retry: { ...current.retry, maxRetries: limits.retryMaxRetries },
	}));
	const settings = globalSettings(home);
	settings.setCompactionEnabled(limits.compactionEnabled);
	settings.setRetryEnabled(limits.retryEnabled);
	settings.setEnabledModels(limits.enabledModels ?? undefined);
	await settings.flush();
};
