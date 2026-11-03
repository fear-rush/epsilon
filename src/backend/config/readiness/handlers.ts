import { Effect } from "effect";

import { ReadinessRpcs } from "#protocol/config/readiness";

import { ReadinessService } from "./service.ts";

/** The one readiness call. The page pushes it again when `config.changes` says so. */
export const ReadinessHandlersLive = ReadinessRpcs.toLayer(
	Effect.gen(function* () {
		const readiness = yield* ReadinessService;
		return {
			"config.readiness.read": () => readiness.read,
		};
	}),
);
