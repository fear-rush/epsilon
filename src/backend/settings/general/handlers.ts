import { Effect } from "effect";

import { GeneralRpcs } from "#protocol/settings/general";

import { EpsilonSettings } from "../epsilon.ts";
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
			"settings.general.read": () => epsilon.view,
			"settings.general.setDefaultModel": (model) => general.setDefaultModel(model),
			"settings.general.setMaxRunning": ({ maxRunning }) => epsilon.setMaxRunning(maxRunning),
			"settings.general.settings": ({ folder }) => general.read(folder),
			"settings.general.writeSetting": ({ key, value }) => general.write(key, value),
		};
	}),
);
