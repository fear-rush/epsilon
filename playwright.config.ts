import { defineConfig } from "@playwright/test";

const baseURL = process.env["EPSILON_E2E_URL"] ?? "http://127.0.0.1:4789";

export default defineConfig({
	testDir: "./test/e2e",
	testMatch: "**/*.e2e.ts",
	timeout: 10_000,
	expect: { timeout: 5_000 },
	fullyParallel: false,
	retries: 0,
	reporter: [["list"]],
	outputDir: "test-results",
	use: {
		baseURL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
});
