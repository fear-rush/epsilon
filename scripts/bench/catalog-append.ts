import { BunServices } from "@effect/platform-bun";
import { Deferred, Effect, Option, Stream } from "effect";

import { appendTurns, prepareBenchData } from "./data.ts";
import { withCatalogScoped } from "./index-for.ts";
import { report } from "./lib.ts";

/** Appending one turn to 20 sessions: the watcher must notice and publish a version. */
const data = prepareBenchData();

const elapsed = await Effect.runPromise(
	withCatalogScoped(data.home, (catalog) =>
		Effect.gen(function* () {
			yield* catalog.sync([data.root]);
			yield* catalog.watch([data.root]);
			const first = yield* Deferred.make<number>();
			yield* Effect.forkScoped(
				catalog.changes.pipe(
					Stream.take(1),
					Stream.runHead,
					Effect.flatMap((version) =>
						Option.isSome(version) ? Deferred.succeed(first, version.value) : Effect.void,
					),
				),
			);
			// Let the PubSub subscription run before the first change can be missed.
			yield* Effect.sleep("20 millis");
			const started = performance.now();
			appendTurns(data.root, 20);
			yield* Deferred.await(first).pipe(
				Effect.timeoutOrElse({ duration: "5 seconds", orElse: () => Effect.succeed(0) }),
			);
			return performance.now() - started;
		}),
	).pipe(Effect.provide(BunServices.layer)),
);

await report("catalog-append", "ms", elapsed);
