import { budget, notBuilt } from "./lib.ts";

/** Building the index from cold over 500 sessions. */
const limit = await budget("catalog-cold");
console.error(`catalog-cold: budget ${limit} ms, subject not built yet; lands in step 4`);
notBuilt("catalog-cold", 4);
