import { budget, notBuilt } from "./lib.ts";

/** A warm list of 500 sessions (~1 GB) must stay under budget. */
const limit = await budget("catalog-list");
console.error(`catalog-list: budget ${limit} ms, subject not built yet; lands in step 4`);
notBuilt("catalog-list", 4);
