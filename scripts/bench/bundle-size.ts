import { budget, notBuilt } from "./lib.ts";

/** Gzipped JS for `/` and `/sessions/$id`. */
const limit = await budget("bundle-size");
console.error(`bundle-size: budget ${limit} KiB, subject not built yet; lands in step 8`);
notBuilt("bundle-size", 8);
