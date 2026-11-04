import { Effect } from "effect";

import { ProviderRpcs } from "#protocol/config/providers";

import { ProvidersService } from "./service.ts";

/**
 * Settings → Providers over the socket. The service owns the composition and the file;
 * the group owns the schemas and the tagged refusal.
 */
export const ProvidersHandlersLive = ProviderRpcs.toLayer(
	Effect.gen(function* () {
		const providers = yield* ProvidersService;
		return {
			"config.providers.list": () => providers.list,
			"config.providers.models": () => providers.models,
			"config.providers.read": ({ id }) => providers.read(id),
			"config.providers.remove": ({ id }) => providers.remove(id),
			"config.providers.save": (input) => providers.save(input),
			"config.providers.setApiKey": ({ id, apiKey }) => providers.setApiKey(id, apiKey),
		};
	}),
);
