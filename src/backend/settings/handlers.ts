import { Effect } from "effect";

import { ConfigRpcs } from "#protocol/settings/epsilon";

import { ConfigChanges } from "./changes.ts";
import { ConfigSnapshotService } from "./snapshot.ts";

/**
 * The settings panel's own two reads: the assembled snapshot and the coarse change
 * stream. The feature groups keep their own handlers.
 */
export const ConfigHandlersLive = ConfigRpcs.toLayer(
	Effect.gen(function* () {
		const snapshot = yield* ConfigSnapshotService;
		const changes = yield* ConfigChanges;
		return {
			"settings.snapshot": ({ folder }) => snapshot.read(folder),
			"settings.changes": () => changes.changes,
		};
	}),
);
