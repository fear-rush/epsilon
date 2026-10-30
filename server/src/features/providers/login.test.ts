/**
 * Sign-in runs pi's own `ModelRuntime.login()`, so these checks drive a real flow
 * against a temporary agent home: start one, answer the question pi asks, and read
 * the credential back from auth.json. The account flows need a browser and a
 * provider, so the API-key flow is the one exercised end to end.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import type { AgentHome } from "../../platform/agent-home";
import { modelRuntime } from "../../platform/pi";
import type { ProviderLoginSnapshot } from "./contract";
import {
	answerProviderLogin,
	cancelProviderLogin,
	readProviderLogin,
	startProviderLogin,
} from "./login";
import { logoutProvider, listBuiltins, readProviderDetail } from "./service";

const home = async (): Promise<AgentHome> =>
	agentHome(await mkdtemp(join(tmpdir(), "epsilon-login-")));

/** pi answers out of band, so a test waits for it instead of assuming one tick. */
const poll = async (
	read: () => ProviderLoginSnapshot | undefined,
	reached: (snapshot: ProviderLoginSnapshot) => boolean,
): Promise<ProviderLoginSnapshot> => {
	for (let attempt = 0; attempt < 200; attempt++) {
		const snapshot = read();
		if (snapshot !== undefined && reached(snapshot)) return snapshot;
		await Bun.sleep(10);
	}
	throw new Error("The sign-in did not reach the expected state");
};

const asked = (snapshot: ProviderLoginSnapshot): boolean => snapshot.question !== undefined;

const settled = (snapshot: ProviderLoginSnapshot): boolean => snapshot.status !== "running";

const stored = async (root: AgentHome) => JSON.parse(await readFile(root.authFile, "utf8"));

describe("provider sign-in", () => {
	test("answers pi's question and stores the credential it writes", async () => {
		const root = await home();
		let signedIn = 0;
		await startProviderLogin(root, root.dir, "anthropic", "api_key", () => signedIn++);

		const asking = await poll(() => readProviderLogin(root, "anthropic"), asked);
		expect(asking.status).toBe("running");
		expect(asking.question?.kind).toBe("secret");
		if (asking.question === undefined) throw new Error("pi asked nothing");

		answerProviderLogin(root, "anthropic", asking.question.id, "sk-test-not-a-key");
		const done = await poll(() => readProviderLogin(root, "anthropic"), settled);
		expect(done.status).toBe("succeeded");
		expect(done.question).toBeUndefined();
		expect(signedIn).toBe(1);

		// The credential is pi's to write, in the shape pi reads back.
		expect((await stored(root)).anthropic).toEqual({
			type: "api_key",
			key: "sk-test-not-a-key",
		});
	});

	test("reports the account pi declares and the credential in use", async () => {
		const root = await home();
		const runtime = await modelRuntime(root);
		expect((await readProviderDetail(root, runtime, "anthropic"))?.auth).toEqual({
			oauth: { name: "Anthropic (Claude Pro/Max)", subscription: true },
		});

		await startProviderLogin(root, root.dir, "anthropic", "api_key", () => {});
		const asking = await poll(() => readProviderLogin(root, "anthropic"), asked);
		if (asking.question === undefined) throw new Error("pi asked nothing");
		answerProviderLogin(root, "anthropic", asking.question.id, "sk-test-not-a-key");
		await poll(() => readProviderLogin(root, "anthropic"), settled);

		const detail = await readProviderDetail(root, await modelRuntime(root), "anthropic");
		expect(detail?.auth.credential).toBe("api_key");
		expect(detail?.configured).toBe(true);
		expect(detail?.source).toBe("stored");
	});

	test("the add picker learns which providers sign in to an account", async () => {
		const root = await home();
		const listed = async () =>
			new Map(
				(await listBuiltins(root, await modelRuntime(root))).map((provider) => [
					provider.id,
					provider,
				]),
			);

		// Before anything is stored: the account pi declares, and nothing else.
		const before = await listed();
		expect(before.get("anthropic")?.auth.oauth).toMatchObject({
			name: "Anthropic (Claude Pro/Max)",
			subscription: true,
		});
		expect(before.get("anthropic")?.auth.credential).toBeUndefined();
		// A provider with no account sign-in is left out of that list entirely.
		expect(before.get("azure")?.auth.oauth).toBeUndefined();

		await startProviderLogin(root, root.dir, "anthropic", "api_key", () => {});
		const asking = await poll(() => readProviderLogin(root, "anthropic"), asked);
		if (asking.question === undefined) throw new Error("pi asked nothing");
		answerProviderLogin(root, "anthropic", asking.question.id, "sk-test-not-a-key");
		await poll(() => readProviderLogin(root, "anthropic"), settled);

		// After: the same list says which credential is now in auth.json.
		expect((await listed()).get("anthropic")?.auth.credential).toBe("api_key");
	});

	test("signing out drops the credential and leaves models.json alone", async () => {
		const root = await home();
		await writeFile(
			root.modelsFile,
			JSON.stringify({
				providers: { anthropic: { name: "Anthropic", apiKey: "from-models-json" } },
			}),
		);
		await startProviderLogin(root, root.dir, "anthropic", "api_key", () => {});
		const asking = await poll(() => readProviderLogin(root, "anthropic"), asked);
		if (asking.question === undefined) throw new Error("pi asked nothing");
		answerProviderLogin(root, "anthropic", asking.question.id, "sk-test-not-a-key");
		await poll(() => readProviderLogin(root, "anthropic"), settled);

		await logoutProvider(root, "anthropic");

		expect((await stored(root)).anthropic).toBeUndefined();
		// The typed entry is untouched, so its key is what pi uses again.
		const models = JSON.parse(await readFile(root.modelsFile, "utf8"));
		expect(models.providers.anthropic.apiKey).toBe("from-models-json");
		expect((await modelRuntime(root)).isUsingOAuth("anthropic")).toBe(false);
	});

	test("a cancelled flow writes no credential", async () => {
		const root = await home();
		await startProviderLogin(root, root.dir, "anthropic", "api_key", () => {});
		await poll(() => readProviderLogin(root, "anthropic"), asked);

		// The answer comes back after the flow settled, so the page can swap in one step
		// instead of waiting for its next poll.
		const done = await cancelProviderLogin(root, "anthropic");
		expect(done?.status).toBe("cancelled");
		expect(await readFile(root.authFile, "utf8").catch(() => "")).not.toContain("anthropic");
	});

	test("a second start replaces the flow the provider was running", async () => {
		const root = await home();
		const first = await startProviderLogin(root, root.dir, "anthropic", "api_key", () => {});
		await poll(() => readProviderLogin(root, "anthropic"), asked);
		await startProviderLogin(root, root.dir, "anthropic", "api_key", () => {});

		// The replaced flow is gone, and the provider has one live record: the new one.
		const live = await poll(() => readProviderLogin(root, "anthropic"), asked);
		expect(live.providerId).toBe(first.providerId);
		expect(live.question).toBeDefined();
	});

	test("refuses a sign-in the provider does not declare", async () => {
		const root = await home();
		await expect(
			startProviderLogin(root, root.dir, "openai-codex", "api_key", () => {}),
		).rejects.toThrow("offers no API key sign-in");
		await expect(
			startProviderLogin(root, root.dir, "no-such-provider", "oauth", () => {}),
		).rejects.toThrow("pi does not know a provider");
	});
});
