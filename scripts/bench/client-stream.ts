import { budget, notBuilt } from "./lib.ts";

/** 20 KB streamed reply in a 2,000-row chat: no long task over the budget. */
const limit = await budget("client-stream");
console.error(`client-stream: budget ${limit} ms, subject not built yet; lands in step 8`);
notBuilt("client-stream", 8);
