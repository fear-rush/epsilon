import type { ProviderInput } from "#protocol/settings/providers";
import { call } from "@/core/runtime";

export const readProvider = (id: string) =>
	call((client) => client["settings.providers.read"]({ id }));

export const saveProvider = (input: ProviderInput) =>
	call((client) => client["settings.providers.save"](input));

export const removeProvider = (id: string) =>
	call((client) => client["settings.providers.remove"]({ id }));

export const setProviderKey = (id: string, apiKey: string) =>
	call((client) => client["settings.providers.setApiKey"]({ apiKey, id }));

export const answerProviderLogin = (providerId: string, promptId: string, value: string) =>
	call((client) => client["settings.providers.answerLogin"]({ promptId, providerId, value }));

export const cancelProviderLogin = (providerId: string) =>
	call((client) => client["settings.providers.cancelLogin"]({ providerId }));
