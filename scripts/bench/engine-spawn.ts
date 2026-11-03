import { budget, notBuilt } from "./lib.ts";

/** Spawn to `ready` for one engine. */
const limit = await budget("engine-spawn");
console.error(`engine-spawn: budget ${limit} ms, subject not built yet; lands in step 5`);
notBuilt("engine-spawn", 5);
