import { Effect } from "effect";

import { GeneralRpcs } from "#protocol/config/general";

import { EpsilonSettings } from "../../settings.ts";
import { GeneralStore } from "./store.ts";

/**
 * Settings → General over the socket. The handlers answer with the services' own shapes;
 * the decoding and the tagged errors are the group's.
 */
export const GeneralHandlersLive = GeneralRpcs.toLayer(
	Effect.gen(function* () {
		const epsilon = yield* EpsilonSettings;
		const general = yield* GeneralStore;
		return {
			"config.general.read": () => epsilon.view,
			"config.general.setDefaultModel": (model) => general.setDefaultModel(model),
			"config.general.setMaxRunning": ({ maxRunning }) => epsilon.setMaxRunning(maxRunning),
			"config.general.settings": ({ folder }) => general.read(folder),
			"config.general.writeSetting": ({ key, value }) => general.write(key, value),
		};
	}),
);
