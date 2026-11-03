import { Effect } from "effect";

import { appendTurns, prepareBenchData } from "./data.ts";
import { withCatalog } from "./index-for.ts";
import { report } from "./lib.ts";

/** Appending one turn to 20 sessions: the sync must notice, incrementally. */
const data = prepareBenchData();

await Effect.runPromise(withCatalog(data.home, (catalog) => catalog.sync([data.root])));

appendTurns(data.root, 20);
const started = performance.now();
const result = await Effect.runPromise(
	withCatalog(data.home, (catalog) => catalog.sync([data.root])),
);
const elapsed = performance.now() - started;

if (result.updated < 20) {
	console.error(`catalog-append: only ${result.updated} sessions were updated, expected 20`);
	process.exit(1);
}
await report("catalog-append", "ms", elapsed);
