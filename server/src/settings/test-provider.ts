/**
 * Try a provider draft before it is saved. The call goes through pi's own client
 * on a throwaway runtime (`registerProvider` is runtime-only, per ADR-0012).
 *
 * Two probes, because keyless endpoints exist: one with no auth header, and one
 * with the typed or saved key when there is a key. A provider that answers both
 * ways is reported as such; a key that fails is an error even when the endpoint
 * would answer without it.
 */
import type { ProviderTestInput } from "shared";

import type { ProviderModelConfig } from "../agent/sdk";
import { readProvidersFile } from "./models-file";
import { createRuntime } from "./providers";
import { KEYLESS_PLACEHOLDER, probe } from "./test-probe";
import type { Probe, Target } from "./test-probe";

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const clip = (text: string, limit = 60): string => {
	const flat = text.replace(/\s+/gu, " ").trim();
	return flat.length > limit ? `${flat.slice(0, limit - 3)}…` : flat;
};

/** Blank header values keep the stored one, the same rule the write follows. */
const draftHeaders = (input: ProviderTestInput): Record<string, string> =>
	Object.fromEntries(
		Object.entries(input.headers ?? {}).filter(([key, value]) => key !== "" && value !== ""),
	);

export const testProviderForHome = async (
	home: string,
	input: ProviderTestInput,
): Promise<{ message: string }> => {
	const typedKey = input.apiKey ?? "";
	const trimmedKey = typedKey.trim();
	if (typedKey !== trimmedKey || /[\r\n\t]/u.test(typedKey)) {
		throw new Error("The API key has spaces or line breaks. Paste only the key.");
	}
	// A literal key never contains whitespace; a `!command` reference may.
	if (/\s/u.test(trimmedKey) && !trimmedKey.startsWith("!")) {
		throw new Error("An API key cannot contain spaces. Paste only the key.");
	}

	const runtime = await createRuntime(home);
	const providerId = input.providerId?.trim() || "epsilon-test";
	const requested = input.model;
	const runtimeModel =
		requested === undefined
			? runtime.getModels(providerId)[0]
			: runtime.getModel(providerId, requested.id);
	const modelId = requested?.id ?? runtimeModel?.id;
	if (modelId === undefined) {
		throw new Error("This provider has no model to test. Add a model first.");
	}

	const api = requested?.api ?? input.api ?? runtimeModel?.api;
	const baseUrl = requested?.baseUrl || input.baseUrl || runtimeModel?.baseUrl;
	if (api === undefined || baseUrl === undefined || baseUrl === "") {
		throw new Error("Choose an API family and a base URL before testing.");
	}

	const stored = await runtime.getAuth(providerId);
	const key = trimmedKey || stored?.auth.apiKey || "";
	const entry =
		input.providerId === undefined ? undefined : (await readProvidersFile(home))[input.providerId];

	const configModel: Extract<ProviderModelConfig, { reasoning: boolean }> = {
		type: "chat",
		id: modelId,
		name: requested?.name ?? runtimeModel?.name ?? modelId,
		api,
		reasoning: requested?.reasoning ?? runtimeModel?.reasoning ?? false,
		input: requested?.input ?? runtimeModel?.input ?? ["text"],
		cost: requested?.cost ?? runtimeModel?.cost ?? ZERO_COST,
		contextWindow: requested?.contextWindow ?? runtimeModel?.contextWindow ?? 128_000,
		maxTokens: requested?.maxTokens ?? runtimeModel?.maxTokens ?? 16_384,
	};
	if (requested?.baseUrl !== undefined) configModel.baseUrl = requested.baseUrl;
	const levelMap = requested?.thinkingLevelMap ?? runtimeModel?.thinkingLevelMap;
	if (levelMap !== undefined) configModel.thinkingLevelMap = levelMap;
	const compat = { ...input.compat, ...runtimeModel?.compat, ...requested?.compat };
	if (Object.keys(compat).length > 0) {
		// SAFETY: compat is a family-specific view of the same loose model field; pi
		// validates the family when it composes the request.
		configModel.compat = compat as NonNullable<
			Extract<ProviderModelConfig, { reasoning: boolean }>["compat"]
		>;
	}

	const draft = draftHeaders(input);
	const headers: Record<string, string> = {};
	for (const [name, value] of Object.entries(stored?.auth.headers ?? {})) {
		if (value !== null) headers[name] = value;
	}
	Object.assign(headers, draft);

	const target: Target = {
		home,
		providerId,
		modelId,
		name: input.name?.trim() || runtimeModel?.name || providerId,
		api,
		baseUrl,
		configModel,
		authHeader: entry?.authHeader === true,
		level: input.level,
		headers,
		draftHeaders: draft,
	};

	// The keyless probe suppresses the auth headers pi derives from a key, so a
	// provider that wants no key sees exactly no key. The placeholder satisfies
	// pi's own "configured" check without reaching the wire.
	const [keyless, keyed] = await Promise.all([
		probe(target, KEYLESS_PLACEHOLDER, true),
		key === "" ? Promise.resolve(undefined) : probe(target, key, false),
	]);

	const evidence = (result: Probe): string => {
		const sent = result.sent === undefined ? "" : `; sent ${result.sent}`;
		if (result.reasoningTokens !== undefined && result.reasoningTokens > 0) {
			return ` ${result.reasoningTokens} reasoning tokens${sent}.`;
		}
		if (result.thinkingChars > 0) return ` ${result.thinkingChars} thinking characters${sent}.`;
		if (result.sent !== undefined) return ` Sent ${result.sent}.`;
		return "";
	};
	const reply = (result: Probe): string =>
		result.text === "" ? "It answered without text." : `It replied "${clip(result.text)}".`;
	const withoutKey = (result: Probe): string =>
		result.ok
			? "The provider also answers without a key."
			: `Without a key: ${clip(result.error, 200)}.`;
	const at = input.level === undefined ? "" : ` at ${input.level}`;

	if (keyed !== undefined) {
		const source = trimmedKey !== "" ? "the typed key" : "the saved credential";
		if (!keyed.ok) {
			throw new Error(
				`The model test failed with ${source}${at}: ${clip(keyed.error, 200)}. ${withoutKey(keyless)}`,
			);
		}
		// A keyless 401 is diagnostic only: quoting it next to a pass reads as a failure.
		const keylessNote = keyless.ok ? ` ${withoutKey(keyless)}` : "";
		return {
			message: `Reached ${providerId}/${modelId} with ${source}${at}. ${reply(keyed)}${evidence(keyed)}${keylessNote} (${keyed.ms} ms)`,
		};
	}

	if (!keyless.ok) throw new Error(`Without an API key${at}: ${clip(keyless.error, 200)}.`);
	return {
		message: `Reached ${providerId}/${modelId} without an API key${at}. ${reply(keyless)}${evidence(keyless)} (${keyless.ms} ms)`,
	};
};
