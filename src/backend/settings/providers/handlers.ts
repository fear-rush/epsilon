import { Effect } from "effect";

import { ProviderRpcs } from "#protocol/settings/providers";

import { ProvidersService } from "./service.ts";

/**
 * Settings → Providers over the socket. The service owns the composition and the file;
 * the group owns the schemas and the tagged refusal.
 */
export const ProvidersHandlersLive = ProviderRpcs.toLayer(
	Effect.gen(function* () {
		const providers = yield* ProvidersService;
		return {
			"settings.providers.list": () => providers.list,
			"settings.providers.models": () => providers.models,
			"settings.providers.read": ({ id }) => providers.read(id),
			"settings.providers.remove": ({ id }) => providers.remove(id),
			"settings.providers.save": (input) => providers.save(input),
			"settings.providers.setApiKey": ({ id, apiKey }) => providers.setApiKey(id, apiKey),
			"settings.providers.import": (input) =>
				providers.import(input).pipe(Effect.map((models) => ({ models }))),
			"settings.providers.test": (input) => providers.test(input),
		};
	}),
);
