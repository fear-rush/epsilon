import { rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

import { seedHome, TMP } from "./home";

/** Build `shared` first: the server and Vite both import its `dist`. */
export default async function globalSetup(): Promise<void> {
	execFileSync("bun", ["run", "--cwd", "shared", "build"], {
		cwd: new URL("../..", import.meta.url).pathname,
		stdio: "inherit",
	});
	await rm(TMP, { recursive: true, force: true });
	await seedHome();
}
