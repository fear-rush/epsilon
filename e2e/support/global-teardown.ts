import { rm } from "node:fs/promises";

import { TMP } from "./home";

/** The scratch home holds nothing worth keeping after a run. */
export default async function globalTeardown(): Promise<void> {
	await rm(TMP, { recursive: true, force: true });
}
