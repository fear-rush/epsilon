import { Effect } from "effect";

import { DiagnosticsRpcs } from "#protocol/diagnostics";

import { DiagnosticsService } from "./service.ts";

/** The one read. It changes nothing, so there is nothing to invalidate. */
export const DiagnosticsHandlersLive = DiagnosticsRpcs.toLayer(
	Effect.gen(function* () {
		const diagnostics = yield* DiagnosticsService;
		return {
			"diagnostics.read": () => diagnostics.read,
		};
	}),
);
