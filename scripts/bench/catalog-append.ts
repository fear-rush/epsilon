import { budget, notBuilt } from "./lib.ts";

/** Appending to 20 files must produce one change signal within the budget. */
const limit = await budget("catalog-append");
console.error(`catalog-append: budget ${limit} ms, subject not built yet; lands in step 4`);
notBuilt("catalog-append", 4);
