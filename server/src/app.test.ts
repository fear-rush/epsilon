import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApp } from "./app";
import { SessionRegistry } from "./features/conversation/registry";
import { agentHome } from "./platform/agent-home";

const appOnScratchHome = async () => {
	const home = agentHome(await mkdtemp(join(tmpdir(), "epsilon-app-")));
	const engines = new SessionRegistry({ cwd: home.dir, home });
	return createApp({ home, projectDir: home.dir, engines });
};

test("health endpoint responds", async () => {
	const app = await appOnScratchHome();
	const response = await app.request("/health");
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ status: "ok" });
});

test("a refused request in a feature router answers in the documented shape", async () => {
	const app = await appOnScratchHome();
	const response = await app.request("/api/settings/default-model", {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({}),
	});
	expect(response.status).toBe(400);
	const body = await response.json();
	expect(Object.keys(body)).toEqual(["message"]);
});
