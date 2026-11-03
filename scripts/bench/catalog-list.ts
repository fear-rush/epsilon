import { Effect } from "effect";

import { prepareBenchData } from "./data.ts";
import { withCatalog } from "./index-for.ts";
import { report } from "./lib.ts";

/** A warm list of the bench set: what the sidebar asks for on every change. */
const data = prepareBenchData();

await Effect.runPromise(withCatalog(data.home, (catalog) => catalog.sync([data.root])));

const samples: number[] = [];
for (let run = 0; run < 20; run++) {
	const started = performance.now();
	// oxlint-disable-next-line no-await-in-loop -- each iteration is one timed sample
	await Effect.runPromise(withCatalog(data.home, (catalog) => catalog.list));
	samples.push(performance.now() - started);
}
samples.sort((left, right) => left - right);
const median = samples[Math.floor(samples.length / 2)] ?? Number.POSITIVE_INFINITY;

await report("catalog-list", "ms", median);
