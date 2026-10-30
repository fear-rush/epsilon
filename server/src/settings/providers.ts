/**
 * Provider endpoints live in `models.json`. pi ships no writer for that file and
 * its documented `registerProvider()` is runtime-only, so the dashboard merges
 * the documented shape itself. A credential is written to the documented
 * `apiKey` field, never to `auth.json`: one file to explain, and pi resolves
 * `$NAME` and `!command` there exactly as it does for a hand-written entry.
 */
import { ModelRuntime } from "../agent/sdk";
import type { BuiltinProvider, ProviderDetail, ProviderModelInput, ProviderView } from "shared";

import { authPath, modelsPath } from "./store";
import { apiOf, baseUrlOf, fieldsOf, readProvidersFile } from "./models-file";
import type { StoredModel } from "./models-file";

/**
 * The ids pi ships, independent of models.json. A second runtime with no models
 * file exposes pi's built-in providers; caching it keeps the distinction exact
 * without importing a private package path.
 */
const builtinIds = new Map<string, Promise<ReadonlySet<string>>>();

const readBuiltinIds = (home: string): Promise<ReadonlySet<string>> => {
	const cached = builtinIds.get(home);
	if (cached !== undefined) return cached;
	const created = ModelRuntime.create({
		authPath: authPath(home),
		modelsPath: null,
		// Only the built-in id list is needed; do not resolve credentials or refresh.
		refreshOnCreate: false,
	}).then((runtime) => new Set(runtime.getProviders().map((provider) => provider.id)));
	builtinIds.set(home, created);
	return created;
};

/** The same runtime the engine builds, for auth status and the model catalog. */
export const createRuntime = (home: string): Promise<ModelRuntime> =>
	ModelRuntime.create({
		authPath: authPath(home),
		modelsPath: modelsPath(home),
	});

const modelInputOf = (model: StoredModel): ProviderModelInput => ({
	id: model.id,
	...fieldsOf(model),
});

export const listProviders = async (
	home: string,
	runtime: ModelRuntime,
): Promise<ProviderView[]> => {
	const file = await readProvidersFile(home);
	const shipped = await readBuiltinIds(home);
	const views: ProviderView[] = runtime.getProviders().flatMap((provider) => {
		const config = file[provider.id];
		const status = runtime.getProviderAuthStatus(provider.id);
		if (config === undefined && !status.configured) return [];
		return [
			{
				id: provider.id,
				name: provider.name,
				baseUrl: baseUrlOf(config, provider),
				api: apiOf(config),
				modelCount: runtime.getModels(provider.id).length,
				configured: status.configured,
				source: status.source,
				hasKey: config?.apiKey !== undefined,
				custom: config !== undefined,
				builtin: shipped.has(provider.id),
			},
		];
	});
	// An entry pi cannot compose is skipped by the runtime. It still belongs in the
	// list, or the only way to fix it would be a terminal.
	const known = new Set(views.map((view) => view.id));
	for (const [id, config] of Object.entries(file)) {
		if (known.has(id)) continue;
		views.push({
			id,
			name: config.name ?? id,
			baseUrl: config.baseUrl,
			api: apiOf(config),
			modelCount: 0,
			configured: false,
			hasKey: config.apiKey !== undefined,
			custom: true,
			builtin: shipped.has(id),
		});
	}
	return views.sort((left, right) => left.name.localeCompare(right.name));
};

/** Every provider pi ships, for the add picker. */
export const listBuiltins = async (
	home: string,
	runtime: ModelRuntime,
): Promise<BuiltinProvider[]> => {
	const file = await readProvidersFile(home);
	return runtime
		.getProviders()
		.map((provider) => ({
			id: provider.id,
			name: provider.name,
			configured:
				file[provider.id] !== undefined || runtime.getProviderAuthStatus(provider.id).configured,
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
};

export const readProviderDetail = async (
	home: string,
	runtime: ModelRuntime,
	providerId: string,
): Promise<ProviderDetail | undefined> => {
	const entry = (await readProvidersFile(home))[providerId];
	const provider = runtime.getProvider(providerId);
	if (provider === undefined && entry === undefined) return undefined;
	const status = runtime.getProviderAuthStatus(providerId);
	const models = runtime.getModels(providerId);
	const overrides = entry?.modelOverrides ?? {};
	const shipped = await readBuiltinIds(home);

	return {
		id: providerId,
		name: entry?.name ?? provider?.name ?? providerId,
		baseUrl: baseUrlOf(entry, provider),
		api: apiOf(entry),
		stored: {
			name: entry?.name,
			baseUrl: entry?.baseUrl,
			api: apiOf(entry),
			compat: entry?.compat,
		},
		builtin: shipped.has(providerId),
		custom: entry !== undefined,
		configured: status.configured,
		source: status.source,
		hasKey: entry?.apiKey !== undefined,
		headerKeys: Object.keys(entry?.headers ?? {}),
		models: (entry?.models ?? []).map(modelInputOf),
		modelOverrides: Object.fromEntries(
			Object.entries(overrides).map(([id, override]) => [id, fieldsOf(override)]),
		),
		catalog: models.map((model) => ({ provider: providerId, id: model.id, name: model.name })),
	};
};
