import type { ProviderInput } from "#protocol/config/providers";
import { call } from "@/runtime";

export const readProvider = (id: string) =>
	call((client) => client["config.providers.read"]({ id }));

export const saveProvider = (input: ProviderInput) =>
	call((client) => client["config.providers.save"](input));

export const removeProvider = (id: string) =>
	call((client) => client["config.providers.remove"]({ id }));

export const setProviderKey = (id: string, apiKey: string) =>
	call((client) => client["config.providers.setApiKey"]({ apiKey, id }));

export const answerProviderLogin = (providerId: string, promptId: string, value: string) =>
	call((client) => client["config.providers.answerLogin"]({ promptId, providerId, value }));

export const cancelProviderLogin = (providerId: string) =>
	call((client) => client["config.providers.cancelLogin"]({ providerId }));
