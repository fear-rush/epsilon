/**
 * Provider endpoints live in `models.json`. pi ships no writer for that file and
 * its documented `registerProvider()` is runtime-only, so the dashboard merges
 * the documented shape itself. A credential is written to the documented
 * `apiKey` field, never to `auth.json`: one file to explain, and pi resolves
 * `$NAME` and `!command` there exactly as it does for a hand-written entry.
 */
import { ModelRuntime } from "../agent/sdk";
import { providerApiSchema } from "shared";
import type {
	BuiltinProvider,
	ModelOverride,
	ProviderDetail,
	ProviderInput,
	ProviderModelInput,
	ProviderView,
} from "shared";
import { join } from "node:path";
import { z } from "zod";

import { modelsPath, readJson, readJsonForWrite, writeJson } from "./store";

const storedModelSchema = z.looseObject({
	id: z.string(),
	name: z.string().optional(),
	api: z.string().optional(),
	baseUrl: z.string().optional(),
	reasoning: z.boolean().optional(),
	input: z.array(z.string()).optional(),
	contextWindow: z.number().optional(),
	maxTokens: z.number().optional(),
	cost: z
		.looseObject({
			input: z.number(),
			output: z.number(),
			cacheRead: z.number(),
			cacheWrite: z.number(),
		})
		.optional(),
});

const providerEntrySchema = z.looseObject({
	name: z.string().optional(),
	baseUrl: z.string().optional(),
	api: z.string().optional(),
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	models: z.array(storedModelSchema).optional(),
	modelOverrides: z.record(z.string(), storedModelSchema.omit({ id: true })).optional(),
});

const modelsFileSchema = z.looseObject({
	providers: z.record(z.string(), providerEntrySchema).optional(),
});

type ModelsFile = z.infer<typeof modelsFileSchema>;
type ProviderEntry = z.infer<typeof providerEntrySchema>;
type StoredModel = z.infer<typeof storedModelSchema>;

/** The editable fields, without the loose index signature Omit would keep. */
type StoredFields = {
	name?: string;
	api?: string;
	baseUrl?: string;
	reasoning?: boolean;
	input?: string[];
	contextWindow?: number;
	maxTokens?: number;
	cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

const EMPTY_FILE: ModelsFile = {};

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
		authPath: join(home, "auth.json"),
		modelsPath: null,
		// Only the built-in id list is needed; do not resolve credentials or refresh.
		refreshOnCreate: false,
	}).then((runtime) => new Set(runtime.getProviders().map((provider) => provider.id)));
	builtinIds.set(home, created);
	return created;
};

const readProvidersFile = async (home: string): Promise<Record<string, ProviderEntry>> => {
	const file = await readJson(modelsPath(home), modelsFileSchema, EMPTY_FILE);
	return file.providers ?? {};
};

/** The same runtime the engine builds, for auth status and the model catalog. */
export const createRuntime = (home: string): Promise<ModelRuntime> =>
	ModelRuntime.create({
		authPath: join(home, "auth.json"),
		modelsPath: modelsPath(home),
	});

const fieldsOf = (model: StoredFields): ModelOverride => {
	const api = providerApiSchema.safeParse(model.api);
	return {
		name: model.name,
		api: api.success ? api.data : undefined,
		baseUrl: model.baseUrl,
		reasoning: model.reasoning,
		input: model.input?.filter(
			(kind): kind is "text" | "image" => kind === "text" || kind === "image",
		),
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		cost: model.cost,
	};
};

const modelInputOf = (model: StoredModel): ProviderModelInput => ({
	id: model.id,
	...fieldsOf(model),
});

const overrideOf = (model: StoredFields): ModelOverride => fieldsOf(model);

const baseUrlOf = (entry: ProviderEntry | undefined, provider: { baseUrl?: string } | undefined) =>
	entry?.baseUrl ?? provider?.baseUrl;

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
				api: config?.api,
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
			api: config.api,
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
	const api = providerApiSchema.safeParse(entry?.api);
	const overrides = entry?.modelOverrides ?? {};
	const shipped = await readBuiltinIds(home);

	return {
		id: providerId,
		name: entry?.name ?? provider?.name ?? providerId,
		baseUrl: baseUrlOf(entry, provider),
		api: api.success ? api.data : undefined,
		stored: {
			name: entry?.name,
			baseUrl: entry?.baseUrl,
			api: api.success ? api.data : undefined,
		},
		builtin: shipped.has(providerId),
		custom: entry !== undefined,
		configured: status.configured,
		source: status.source,
		hasKey: entry?.apiKey !== undefined,
		headerKeys: Object.keys(entry?.headers ?? {}),
		models: (entry?.models ?? []).map(modelInputOf),
		modelOverrides: Object.fromEntries(
			Object.entries(overrides).map(([id, override]) => [id, overrideOf(override)]),
		),
		catalog: models.map((model) => ({ provider: providerId, id: model.id, name: model.name })),
	};
};

/** Write only the fields the form edits, keeping the rest of a hand-edited entry. */
const mergeModel = (model: ProviderModelInput, existing: StoredModel | undefined): StoredModel => {
	const next: StoredModel = { ...(existing ?? {}), id: model.id };
	if (model.name === undefined || model.name === "") delete next.name;
	else next.name = model.name;
	if (model.api === undefined) delete next.api;
	else next.api = model.api;
	if (model.baseUrl === undefined || model.baseUrl === "") delete next.baseUrl;
	else next.baseUrl = model.baseUrl;
	if (model.reasoning === undefined) delete next.reasoning;
	else next.reasoning = model.reasoning;
	if (model.input === undefined) delete next.input;
	else next.input = model.input;
	if (model.contextWindow === undefined) delete next.contextWindow;
	else next.contextWindow = model.contextWindow;
	if (model.maxTokens === undefined) delete next.maxTokens;
	else next.maxTokens = model.maxTokens;
	if (model.cost === undefined) delete next.cost;
	else next.cost = model.cost;
	return next;
};

/** Upsert one provider. Fields the caller omitted keep their stored value. */
export const writeProvider = async (home: string, input: ProviderInput): Promise<void> => {
	const file = await readJsonForWrite(modelsPath(home), modelsFileSchema, EMPTY_FILE);
	const providers = file.providers ?? {};
	const next = { ...(providers[input.id] ?? {}) };

	if (input.name !== undefined) {
		if (input.name === "") delete next.name;
		else next.name = input.name;
	}
	if (input.baseUrl !== undefined) {
		if (input.baseUrl === "") delete next.baseUrl;
		else next.baseUrl = input.baseUrl;
	}
	if (input.api !== undefined) next.api = input.api;
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
		else next.modelOverrides = input.modelOverrides;
	}

	// Saving an untouched built-in must not create an empty entry.
	if (Object.keys(next).length === 0) delete providers[input.id];
	else providers[input.id] = next;
	await writeJson(modelsPath(home), { ...file, providers });
};

/**
 * Drop the models.json entry and, when the credential is a stored one, the entry
 * in auth.json too. The list shows a provider with either, so leaving the
 * credential behind would bring the row back the moment it was deleted. A key
 * from the environment or from models.json is not touched here: the first is not
 * ours to remove and the second leaves with the entry.
 */
export const removeProvider = async (home: string, providerId: string): Promise<void> => {
	const file = await readJsonForWrite(modelsPath(home), modelsFileSchema, EMPTY_FILE);
	const providers = { ...(file.providers ?? {}) };
	delete providers[providerId];
	await writeJson(modelsPath(home), { ...file, providers });
	// The list shows a provider with an entry or with a credential. Once the entry
	// is gone, a credential that is still stored is the only thing that would bring
	// the row back, so it goes too; a key from the environment is not ours to remove.
	const runtime = await createRuntime(home);
	if (runtime.getProviderAuthStatus(providerId).source === "stored") {
		await runtime.logout(providerId);
	}
};
