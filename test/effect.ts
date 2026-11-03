import { test } from "bun:test";

import { Effect } from "effect";
import { TestClock } from "effect/testing";

/**
 * An `Effect` body with `TestClock` provided and Bun's per-test timeout as its hard bound.
 *
 * The bound must be Bun's: every Effect timeout runs on the virtual clock, so a hung body
 * would never reach one. This wrapper is the test entry point, which is why it provides
 * the layer itself.
 */
export function itEffect<A, E>(
	name: string,
	body: () => Effect.Effect<A, E, TestClock.TestClock>,
	ms = 2000,
): void {
	// oxlint-disable-next-line effecttsgo/strict-effect-provide -- this wrapper is the test entry point
	const run = (): Promise<A> => Effect.runPromise(Effect.provide(body(), TestClock.layer()));
	test(name, run, ms);
}
