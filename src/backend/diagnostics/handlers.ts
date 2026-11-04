import { Effect } from "effect";

import { DiagnosticsRpcs } from "#protocol/diagnostics";

import { Engines } from "../conversation/registry.ts";
import { DiagnosticsService } from "./service.ts";

/**
 * What is running, and the one write the page has: stopping an engine.
 *
 * A stop is the same close the supervisor's own shutdown uses, so the chat's next command
 * starts a new process from its file rather than resurrecting this one.
 */
export const DiagnosticsHandlersLive = DiagnosticsRpcs.toLayer(
	Effect.gen(function* () {
		const diagnostics = yield* DiagnosticsService;
		const engines = yield* Engines;
		return {
			"diagnostics.read": () => diagnostics.read,
			"diagnostics.stop": ({ sessionId }) => Effect.asVoid(engines.close(sessionId)),
		};
	}),
);
