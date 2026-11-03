import { budget, notBuilt } from "./lib.ts";

/** The first window of a 46 MB session; the frame size is asserted with it. */
const limit = await budget("open-window");
console.error(`open-window: budget ${limit} ms, subject not built yet; lands in step 5`);
notBuilt("open-window", 5);
