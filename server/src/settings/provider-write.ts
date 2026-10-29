/**
 * Writing providers to `models.json`. The read side is `providers.ts`; this file
 * owns the merge policy, which is the part that must not lose the operator's
 * config: provider fields are partial (omitted keeps, empty clears), a model is a
 * complete record, and unknown keys survive on every object.
 */
import type { ProviderInput, ProviderModelInput } from "shared";

import { modelsPath, readJsonForWrite, writeJson } from "./store";
import { createRuntime } from "./providers";
import { EMPTY_MODELS_FILE, mergeModelFields, modelsFileSchema } from "./models-file";
import type { ModelsFile, ProviderEntry, StoredModel } from "./models-file";

const mergeModel = (model: ProviderModelInput, existing: StoredModel | undefined): StoredModel => ({
	...mergeModelFields(existing ?? {}, model),
	id: model.id,
});

/** Upsert one provider. Fields the caller omitted keep their stored value. */
export const writeProvider = async (home: string, input: ProviderInput): Promise<void> => {
	const file = await readJsonForWrite(modelsPath(home), modelsFileSchema, EMPTY_MODELS_FILE);
	const providers = file.providers ?? {};
	const next: ProviderEntry = { ...(providers[input.id] ?? {}) };

	if (input.name !== undefined) {
		if (input.name === "") delete next.name;
		else next.name = input.name;
	}
	if (input.baseUrl !== undefined) {
		if (input.baseUrl === "") delete next.baseUrl;
		else next.baseUrl = input.baseUrl;
	}
	if (input.api !== undefined) {
		if (input.api === "") delete next.api;
		else next.api = input.api;
	}
	if (input.apiKey !== undefined && input.apiKey !== "") next.apiKey = input.apiKey;
	if (input.headers !== undefined) {
		// A blank value for an existing key keeps the stored secret; the browser
		// only ever sees the key name. Keys left out are removed.
		const stored = next.headers ?? {};
		const resolved: Record<string, string> = {};
		for (const [key, value] of Object.entries(input.headers)) {
			if (value === "") {
				const current = stored[key];
				if (current !== undefined) resolved[key] = current;
			} else {
				resolved[key] = value;
			}
		}
		if (Object.keys(resolved).length === 0) delete next.headers;
		else next.headers = resolved;
	}
	if (input.models !== undefined) {
		if (input.models.length === 0) delete next.models;
		else {
			const existing = new Map((next.models ?? []).map((model) => [model.id, model]));
			next.models = input.models.map((model) => mergeModel(model, existing.get(model.id)));
		}
	}
	if (input.modelOverrides !== undefined) {
		if (Object.keys(input.modelOverrides).length === 0) delete next.modelOverrides;
		else {
			// The form sends every override it shows, so an omitted id is removed. A
			// field inside an override it cannot see keeps the stored value.
			const stored = next.modelOverrides ?? {};
			next.modelOverrides = Object.fromEntries(
				Object.entries(input.modelOverrides).map(([id, override]) => [
					id,
					mergeModelFields(stored[id] ?? {}, override),
				]),
			);
		}
	}

	// Saving an untouched built-in must not create an empty entry.
	if (Object.keys(next).length === 0) delete providers[input.id];
	else providers[input.id] = next;
	const written: ModelsFile = { ...file, providers };
	await writeJson(modelsPath(home), written);
};

/**
 * Drop the models.json entry and, when the credential is a stored one, the entry
 * in auth.json too. The list shows a provider with either, so leaving the
 * credential behind would bring the row back the moment it was deleted. A key
 * from the environment or from models.json is not touched here: the first is not
 * ours to remove and the second leaves with the entry.
 */
export const removeProvider = async (home: string, providerId: string): Promise<void> => {
	const file = await readJsonForWrite(modelsPath(home), modelsFileSchema, EMPTY_MODELS_FILE);
	const providers = { ...(file.providers ?? {}) };
	delete providers[providerId];
	const written: ModelsFile = { ...file, providers };
	await writeJson(modelsPath(home), written);
	const runtime = await createRuntime(home);
	if (runtime.getProviderAuthStatus(providerId).source === "stored") {
		await runtime.logout(providerId);
	}
};
