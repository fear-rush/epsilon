import { Effect } from "effect";

import { ProviderLoginRpcs } from "#protocol/settings/providers";

import { ProviderLoginService } from "./login.ts";

/** The provider sign-in stream and its two answers. */
export const ProviderLoginHandlersLive = ProviderLoginRpcs.toLayer(
	Effect.gen(function* () {
		const login = yield* ProviderLoginService;
		return {
			"settings.providers.answerLogin": ({ providerId, promptId, value }) =>
				login.answer(providerId, promptId, value),
			"settings.providers.cancelLogin": ({ providerId }) => login.cancel(providerId),
			"settings.providers.login": ({ providerId, type }) => login.start(providerId, type),
			"settings.providers.loginState": ({ providerId }) => login.read(providerId),
		};
	}),
);
