import { rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

import { linkSandbox } from "../../scripts/sandbox";
import { seedHome, TMP, LIVE } from "./home";

/**
 * Build `shared` first: the server and Vite both import its `dist`. The sandbox
 * link is created here too, so `bun run test:e2e` works on a fresh clone: the
 * run's home lives under `.sandbox/e2e`, outside the repository and `~`.
 */
export default async function globalSetup(): Promise<void> {
	execFileSync("bun", ["run", "--cwd", "shared", "build"], {
		cwd: new URL("../..", import.meta.url).pathname,
		stdio: "inherit",
	});
	linkSandbox();
	await rm(TMP, { recursive: true, force: true });
	await seedHome();
	if (!LIVE) {
		console.warn(
			"e2e: no COMMANDCODE_API_KEY in server/.env or the environment; the turn tests will skip.",
		);
	}
}
