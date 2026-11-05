import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer, Ref } from "effect";

import { AgentHomeLive } from "../../src/backend/platform/agent-home.ts";
import { Catalog, CatalogLive } from "../../src/backend/sessions/catalog.ts";
import { linearSession, writeSession } from "../../test/sessions.ts";
import { report } from "./lib.ts";

/**
 * The longest the server cannot answer during a reconcile.
 *
 * A cold build on the operator's real home reads 1.8 GB and took 14.7 s before the loop
 * handed control back between slices; Effect does not preempt synchronous work, so every
 * socket request waited for the whole build. This measures the gap directly: a fiber that
 * asks to run again after each turn records the longest stretch it missed, while the
 * catalog reconciles 300 synthetic sessions of 40 entries.
 */
const rows = 300;
const root = join(tmpdir(), `epsilon-bench-stall-${process.pid}`);
const indexPath = join(tmpdir(), `epsilon-bench-stall-${process.pid}.sqlite`);
rmSync(root, { force: true, recursive: true });
rmSync(indexPath, { force: true });
for (let index = 0; index < rows; index++) {
	writeSession(
		join(root, "sessions", "--bench--"),
		`s-${index}`,
		linearSession(`s-${index}`, "/tmp/bench", 40),
	);
}
mkdirSync(join(root, "chats"), { recursive: true });

const catalog = CatalogLive(indexPath, {
	formatVersion: 3,
	piVersion: "1.4.0",
	schemaVersion: "1",
}).pipe(Layer.provideMerge(AgentHomeLive(root, root)), Layer.provideMerge(BunServices.layer));

const stall = await Effect.runPromise(
	Effect.scoped(
		Effect.gen(function* () {
			const service = yield* Catalog;
			const longest = yield* Ref.make(0);
			const turns = yield* Ref.make(0);
			yield* Effect.forkScoped(
				Effect.forever(
					Effect.gen(function* () {
						const before = Date.now();
						yield* Effect.yieldNow;
						yield* Ref.update(longest, (ms) => Math.max(ms, Date.now() - before));
						yield* Ref.update(turns, (count) => count + 1);
					}),
				),
			);
			const started = Date.now();
			yield* service.sync([join(root, "sessions")]);
			const buildMs = Date.now() - started;
			// A ticker that never ran did not measure a gap: the whole build was one stall.
			return (yield* Ref.get(turns)) === 0 ? buildMs : yield* Ref.get(longest);
		}),
	).pipe(Effect.provide(catalog)),
);

rmSync(root, { force: true, recursive: true });
rmSync(indexPath, { force: true });
await report("catalog-stall", "ms", stall);
