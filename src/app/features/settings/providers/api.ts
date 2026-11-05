import { Effect } from "effect";

import type {
	ProviderImportInput,
	ProviderInput,
	ProviderTestInput,
} from "#protocol/settings/providers";
import { call } from "@/core/runtime";

export const readProvider = (id: string) =>
	call((client) => client["settings.providers.read"]({ id }));

export const saveProvider = (input: ProviderInput) =>
	call((client) => client["settings.providers.save"](input));

export const removeProvider = (id: string) =>
	call((client) => client["settings.providers.remove"]({ id }));

export const setProviderKey = (id: string, apiKey: string) =>
	call((client) => client["settings.providers.setApiKey"]({ apiKey, id }));

export const importProviderModels = (input: ProviderImportInput) =>
	call((client) => client["settings.providers.import"](input));

export const testProvider = (input: ProviderTestInput) =>
	call((client) =>
		Effect.map(client["settings.providers.test"](input), (result) => result.message),
	);

/** What this provider's sign-in last reported, or null when nothing was signed in. */
export const readProviderLogin = (providerId: string) =>
	call((client) => client["settings.providers.loginState"]({ providerId }));

export const logoutProvider = (providerId: string) =>
	call((client) => client["settings.providers.logout"]({ id: providerId }));

export const answerProviderLogin = (providerId: string, promptId: string, value: string) =>
	call((client) => client["settings.providers.answerLogin"]({ promptId, providerId, value }));

export const cancelProviderLogin = (providerId: string) =>
	call((client) => client["settings.providers.cancelLogin"]({ providerId }));
