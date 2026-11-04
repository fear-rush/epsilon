import { Effect } from "effect";

import { ContextRpcs } from "#protocol/settings/context";

import { ContextService } from "./service.ts";

/** The context page's one read. It changes nothing, so there is nothing to invalidate. */
export const ContextHandlersLive = ContextRpcs.toLayer(
	Effect.gen(function* () {
		const context = yield* ContextService;
		return {
			"settings.context.read": ({ folder }) => context.read(folder),
		};
	}),
);
