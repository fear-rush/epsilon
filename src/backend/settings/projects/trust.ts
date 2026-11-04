import { Effect } from "effect";

import type { PiProjectTrustApi } from "../../platform/pi.ts";

/**
 * pi's trust decision for the backend, with no extension set.
 *
 * The order is pi's: a folder with nothing gated is trusted without a record, a saved
 * decision covers it and its subfolders, and the home's `defaultProjectTrust` decides
 * the rest. `"ask"` is false here because there is no synchronous dialog; the page's
 * Trust gate asks, and until the operator answers nothing loads. An engine runs the
 * same chain again with its bootstrap extensions, which may answer with a handler.
 */
export const decideProjectTrust = (trust: PiProjectTrustApi, cwd: string): Effect.Effect<boolean> =>
	Effect.gen(function* () {
		if (!(yield* trust.hasResources(cwd))) return true;
		const saved = yield* trust.read(cwd);
		if (saved !== null) return saved;
		return (yield* trust.defaultTrust(cwd)) === "always";
	});
