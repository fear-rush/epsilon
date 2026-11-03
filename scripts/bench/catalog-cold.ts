import { rmSync } from "node:fs";
import { join } from "node:path";

import { Effect } from "effect";

import { prepareBenchData } from "./data.ts";
import { withCatalog } from "./index-for.ts";
import { report } from "./lib.ts";

/** A cold index build over the bench set: no index file, every session parsed. */
const data = prepareBenchData();
const indexPath = join(data.home, ".epsilon", "session-index.sqlite");
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${indexPath}${suffix}`, { force: true });

const started = performance.now();

await Effect.runPromise(withCatalog(data.home, (catalog) => catalog.sync([data.root])));
const elapsed = performance.now() - started;

await report("catalog-cold", "ms", elapsed);
