import { defineConfig } from "@playwright/test";

import { AGENT_HOME, USER_HOME } from "./e2e/support/home";

/**
 * Browser tests against a seeded scratch home. The server never reads `~/.pi`:
 * `EPSILON_AGENT_HOME` and `EPSILON_USER_HOME` point at the fixture tree, and the
 * global setup rebuilds it before the servers start.
 */
export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/*.spec.ts",
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env["CI"]),
	retries: 0,
	timeout: 45_000,
	expect: { timeout: 10_000 },
	reporter: [["list"]],
	globalSetup: "./e2e/support/global-setup.ts",
	globalTeardown: "./e2e/support/global-teardown.ts",
	use: {
		baseURL: "http://localhost:5173",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	webServer: [
		{
			command: "bun run --cwd server src/main.ts",
			url: "http://127.0.0.1:3000/api/readiness",
			reuseExistingServer: false,
			timeout: 120_000,
			env: {
				EPSILON_AGENT_HOME: AGENT_HOME,
				EPSILON_USER_HOME: USER_HOME,
				PORT: "3000",
			},
		},
		{
			command: "bunx --bun vite --port 5173 --strictPort",
			cwd: "client",
			url: "http://localhost:5173",
			reuseExistingServer: false,
			timeout: 120_000,
		},
	],
});
