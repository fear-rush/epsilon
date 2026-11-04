import { Effect } from "effect";

import { ProviderLoginRpcs } from "#protocol/config/providers";

import { ProviderLoginService } from "./login.ts";

/** The provider sign-in stream and its two answers. */
export const ProviderLoginHandlersLive = ProviderLoginRpcs.toLayer(
	Effect.gen(function* () {
		const login = yield* ProviderLoginService;
		return {
			"config.providers.answerLogin": ({ providerId, promptId, value }) =>
				login.answer(providerId, promptId, value),
			"config.providers.cancelLogin": ({ providerId }) => login.cancel(providerId),
			"config.providers.login": ({ providerId, type }) => login.start(providerId, type),
		};
	}),
);
