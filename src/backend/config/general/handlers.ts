import { Effect } from "effect";
import type { Layer } from "effect";
import type { Rpc, RpcGroup } from "effect/rpc";

import { GeneralRpcs } from "#protocol/config/general";

import { EpsilonSettings } from "../../settings.ts";

/**
 * Settings → General over the socket. The handlers answer with the service's own shapes;
 * the decoding and the tagged errors are the group's.
 */
export const GeneralHandlersLive: Layer.Layer<
	Rpc.ToHandler<RpcGroup.Rpcs<typeof GeneralRpcs>>,
	never,
	EpsilonSettings
> = GeneralRpcs.toLayer(
	Effect.gen(function* () {
		const settings = yield* EpsilonSettings;
		return {
			"config.general.read": () => settings.view,
			"config.general.setMaxRunning": ({ maxRunning }) => settings.setMaxRunning(maxRunning),
		};
	}),
);
