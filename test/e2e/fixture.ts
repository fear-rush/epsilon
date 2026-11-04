import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test as base } from "@playwright/test";

import { launchEpsilon } from "./app.ts";
import type { RunningApp } from "./app.ts";
import { startStubModel, writeStubModels } from "./stub-model.ts";
import type { StubModel } from "./stub-model.ts";

/**
 * Every e2e test gets its own agent home, its own stub model and its own server, so one
 * test's sessions and credentials cannot leak into another.
 */
export type Fixtures = {
	readonly agentHome: string;
	readonly stub: StubModel;
	readonly app: RunningApp;
};

/**
 * A port nothing else holds. Playwright runs files in separate workers, so one fixed port
 * would make two tests share a server and one test's stop kill another test's page.
 */
const freePort = (): Promise<number> =>
	new Promise((resolve, reject) => {
		const probe = createServer();
		probe.on("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const address = probe.address();
			if (address === null || typeof address === "string") {
				probe.close();
				reject(new Error("no port was assigned"));
				return;
			}
			const { port } = address;
			probe.close(() => resolve(port));
		});
	});

export const test = base.extend<Fixtures>({
	// oxlint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
	agentHome: async ({}, use) => {
		const home = mkdtempSync(join(tmpdir(), "epsilon-e2e-"));
		await use(home);
	},
	// oxlint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form
	stub: async ({}, use) => {
		const stub = await startStubModel();
		await use(stub);
		stub.stop();
	},
	app: async ({ agentHome, stub }, use) => {
		writeStubModels(agentHome, stub.baseUrl);
		const app = await launchEpsilon({ home: agentHome, port: await freePort() });
		await use(app);
		app.stop();
	},
});

export { expect } from "@playwright/test";
export type { RunningApp };
