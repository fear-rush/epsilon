/**
 * Provider endpoints live in `models.json`. pi ships no writer for that file and
 * its documented `registerProvider()` is runtime-only, so the dashboard merges
 * the documented shape itself. A credential is written to the documented
 * `apiKey` field, never to `auth.json`: one file to explain, and pi resolves
 * `$NAME` and `!command` there exactly as it does for a hand-written entry.
 *
 * Reading is `listProviders` and friends. Writing is `writeProvider` and
 * `removeProvider`, which own the merge policy that must not lose the operator's
 * config: provider fields are partial (omitted keeps, empty clears), a model is a
 * complete record, and unknown keys survive on every object.
 */

import type { AgentHome } from "../../platform/agent-home";
import { mergeSecrets, setOrDelete } from "../../platform/patch";
import { builtinRuntime, modelRuntime } from "../../platform/pi";
import type { ModelRuntime } from "../../platform/pi";
import { apiOf, baseUrlOf, fieldsOf, mergeModelFields, overrideFieldsOf } from "./models-file";
import type { ProviderEntry, StoredModel } from "./models-file";
import { modelsDocument, readProvidersFile } from "./store";
import type {
	BuiltinProvider,
	ProviderDetail,
	ProviderInput,
	ProviderModelInput,
	ProviderView,
} from "./contract";

/**
 * The ids pi ships, independent of models.json. A second runtime with no models
 * file exposes pi's built-in providers; caching it keeps the distinction exact
 * without importing a private package path.
 */
const builtinIds = new Map<string, Promise<ReadonlySet<string>>>();

const readBuiltinIds = (home: AgentHome): Promise<ReadonlySet<string>> => {
	const cached = builtinIds.get(home.dir);
	if (cached !== undefined) return cached;
	const created = builtinRuntime(home).then(
		(runtime) => new Set(runtime.getProviders().map((provider) => provider.id)),
	);
	builtinIds.set(home.dir, created);
	return created;
};

const modelInputOf = (model: StoredModel): ProviderModelInput => ({
	id: model.id,
	...fieldsOf(model),
});

/** A provider as the runtime returns it, without importing pi's own type here. */
type RuntimeProvider = NonNullable<ReturnType<ModelRuntime["getProvider"]>>;

/** The account pi declares for a provider, in the shape the panel draws. */
const oauthOf = (provider: RuntimeProvider): ProviderDetail["auth"]["oauth"] => {
	const oauth = provider.auth.oauth;
	if (oauth === undefined) return undefined;
	return {
		name: oauth.name,
		label: oauth.loginLabel,
		subscription: oauth.isSubscription === true,
	};
};

/** pi's API-key method. Ambient-only providers omit `login`, so the panel cannot start one. */
const apiKeyOf = (provider: RuntimeProvider): ProviderDetail["auth"]["apiKey"] => {
	const apiKey = provider.auth.apiKey;
	if (apiKey === undefined) return undefined;
	return { name: apiKey.name, interactive: apiKey.login !== undefined };
};

export const listProviders = async (
	home: AgentHome,
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
	home: AgentHome,
	runtime: ModelRuntime,
): Promise<BuiltinProvider[]> => {
	const file = await readProvidersFile(home);
	const credentials = new Map(
		(await runtime.listCredentials()).map((credential) => [credential.providerId, credential.type]),
	);
	return runtime
		.getProviders()
		.map((provider) => ({
			id: provider.id,
			name: provider.name,
			configured:
				file[provider.id] !== undefined || runtime.getProviderAuthStatus(provider.id).configured,
			auth: {
				credential: credentials.get(provider.id),
				oauth: oauthOf(provider),
				apiKey: apiKeyOf(provider),
			},
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
};

export const readProviderDetail = async (
	home: AgentHome,
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
	// auth.json holds at most one credential per provider, and pi uses it ahead of a
	// key in models.json. The page names it instead of leaving the operator to guess.
	const credential = (await runtime.listCredentials()).find(
		(stored) => stored.providerId === providerId,
	)?.type;

	return {
		id: providerId,
		// A provider without an entry can still be signed in, so the shipped name applies.
		name: entry?.name ?? provider?.name ?? providerId,
		baseUrl: baseUrlOf(entry, provider),
		api: apiOf(entry),
		stored: {
			name: entry?.name,
			baseUrl: entry?.baseUrl,
			api: apiOf(entry),
			compat: entry?.compat,
			authHeader: entry?.authHeader,
			oauth: entry?.oauth,
		},
		builtin: shipped.has(providerId),
		custom: entry !== undefined,
		configured: status.configured,
		source: status.source,
		hasKey: entry?.apiKey !== undefined,
		headerKeys: Object.keys(entry?.headers ?? {}),
		auth: {
			credential,
			oauth: provider === undefined ? undefined : oauthOf(provider),
			apiKey: provider === undefined ? undefined : apiKeyOf(provider),
		},
		models: (entry?.models ?? []).map(modelInputOf),
		modelOverrides: Object.fromEntries(
			Object.entries(overrides).map(([id, override]) => [id, overrideFieldsOf(override)]),
		),
		// The composed model, so the override dialog seeds from pi's effective values.
		catalog: models.map((model) => ({ provider: providerId, id: model.id, ...fieldsOf(model) })),
	};
};

const mergeModel = (model: ProviderModelInput, existing: StoredModel | undefined): StoredModel => {
	const merged = mergeModelFields(existing ?? {}, model);
	// SAFETY: `model` is a ProviderModelInput, so a cost it names has all four rates,
	// and the stored schema for a `models` entry requires them too.
	return { ...merged, id: model.id } as StoredModel;
};

/** Upsert one provider. Fields the caller omitted keep their stored value. */
export const writeProvider = (home: AgentHome, input: ProviderInput): Promise<void> =>
	modelsDocument(home).update((file) => {
		const providers = file.providers ?? {};
		const next: ProviderEntry = { ...(providers[input.id] ?? {}) };

		if (input.name !== undefined) setOrDelete(next, "name", input.name);
		if (input.baseUrl !== undefined) setOrDelete(next, "baseUrl", input.baseUrl);
		if (input.api !== undefined) setOrDelete(next, "api", input.api);
		if (input.apiKey !== undefined && input.apiKey !== "") next.apiKey = input.apiKey;
		if (input.compat !== undefined) setOrDelete(next, "compat", input.compat);
		if (input.authHeader !== undefined) {
			if (input.authHeader === "") delete next.authHeader;
			else next.authHeader = input.authHeader;
		}
		if (input.oauth !== undefined) {
			if (input.oauth === "") delete next.oauth;
			else next.oauth = input.oauth;
		}
		if (input.headers !== undefined) {
			// A blank value for an existing key keeps the stored secret; the browser
			// only ever sees the key name. Keys left out are removed.
			const merged = mergeSecrets(input.headers, next.headers ?? {}, { onMissingStored: "drop" });
			setOrDelete(next, "headers", merged);
		}
		if (input.models !== undefined) {
			const existing = new Map((next.models ?? []).map((model) => [model.id, model]));
			setOrDelete(
				next,
				"models",
				input.models.map((model) => mergeModel(model, existing.get(model.id))),
			);
		}
		if (input.modelOverrides !== undefined) {
			// The form sends only the fields the operator touched, so an omitted field
			// keeps the stored value. An id the form no longer shows is removed.
			const stored = next.modelOverrides ?? {};
			setOrDelete(
				next,
				"modelOverrides",
				Object.fromEntries(
					Object.entries(input.modelOverrides).map(([id, override]) => [
						id,
						mergeModelFields(stored[id] ?? {}, override, "keep"),
					]),
				),
			);
		}

		// Saving an untouched built-in must not create an empty entry.
		if (Object.keys(next).length === 0) delete providers[input.id];
		else providers[input.id] = next;
		return { ...file, providers };
	});

/**
 * Remove the credential auth.json holds for this provider, and nothing else. The
 * models.json entry stays, so a key in it becomes the one pi uses again.
 */
export const logoutProvider = async (home: AgentHome, providerId: string): Promise<void> => {
	const runtime = await modelRuntime(home);
	const stored = (await runtime.listCredentials()).some(
		(credential) => credential.providerId === providerId,
	);
	if (!stored) throw new Error("This provider has no stored credential to remove");
	await runtime.logout(providerId);
};

/**
 * Drop the models.json entry and, when the credential is a stored one, the entry
 * in auth.json too. The list shows a provider with either, so leaving the
 * credential behind would bring the row back the moment it was deleted. A key
 * from the environment or from models.json is not touched here: the first is not
 * ours to remove and the second leaves with the entry.
 */
export const removeProvider = async (home: AgentHome, providerId: string): Promise<void> => {
	await modelsDocument(home).update((file) => {
		const providers = { ...(file.providers ?? {}) };
		delete providers[providerId];
		return { ...file, providers };
	});
	const runtime = await modelRuntime(home);
	if (runtime.getProviderAuthStatus(providerId).source === "stored") {
		await runtime.logout(providerId);
	}
};
