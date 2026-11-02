/**
 * pi's trust chain against real temporary homes: the store is pi's own, the
 * default is the home's `settings.json`, and only the handlers the loader would
 * have produced are stood in for.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { projectTrustStore, settingsManager } from "../../platform/pi";
import { readProjectStatus, setProjectTrust } from "./service";
import { decideProjectTrust } from "./trust";

const scratch = async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "epsilon-trust-")));
	const home = agentHome(join(root, "home"));
	await mkdir(home.dir, { recursive: true });
	const project = join(root, "project");
	await mkdir(project);
	return { home, project, root };
};

/** A folder with a resource pi only loads when the folder is trusted. */
const gated = async (root: string, name = "gated") => {
	const path = join(root, name);
	await mkdir(join(path, ".pi"), { recursive: true });
	await writeFile(join(path, ".pi", "mcp.json"), "{}\n");
	return path;
};

const setDefault = async (
	home: ReturnType<typeof agentHome>,
	value: "always" | "never" | "ask",
) => {
	const settings = settingsManager(home.chatsDir, home);
	settings.setDefaultProjectTrust(value);
	await settings.flush();
};

const trustFile = async (home: ReturnType<typeof agentHome>) =>
	JSON.parse(await readFile(join(home.dir, "trust.json"), "utf8").catch(() => "{}"));

describe("a project settings file pi cannot load", () => {
	test("is named on the trust page before and after the folder is trusted", async () => {
		const { home, root } = await scratch();
		const project = await gated(root);
		const file = join(project, ".pi", "settings.json");
		await writeFile(file, "{ broken");

		const status = await readProjectStatus(home, project);
		expect(status.settingsProblems).toEqual([
			{ scope: "project", path: file, message: expect.any(String) },
		]);

		const trusted = await setProjectTrust(home, project, "trust");
		expect(trusted.settingsProblems).toEqual(status.settingsProblems);
	});

	test("a file that parses adds no problem", async () => {
		const { home, root } = await scratch();
		const project = await gated(root);
		await writeFile(join(project, ".pi", "settings.json"), "{}\n");
		expect((await readProjectStatus(home, project)).settingsProblems).toEqual([]);
	});
});

describe("changing a folder's trust decision", () => {
	test("trust, revoke and forget write the record and answer the folder as it stands", async () => {
		const { home, root } = await scratch();
		const project = await gated(root);
		const sibling = await gated(root, "sibling");
		await setProjectTrust(home, sibling, "trust");

		const trusted = await setProjectTrust(home, project, "trust");
		expect(trusted).toMatchObject({ trusted: true, decidedHere: true });
		expect(await trustFile(home)).toEqual({ [project]: true, [sibling]: true });

		const revoked = await setProjectTrust(home, project, "untrust");
		expect(revoked).toMatchObject({ trusted: false, decidedHere: true });
		expect(await trustFile(home)).toEqual({ [project]: false, [sibling]: true });

		const forgotten = await setProjectTrust(home, project, "forget");
		expect(forgotten).toMatchObject({ trusted: false, decidedHere: false });
		// Only this folder's record goes; pi's store keeps the sibling's decision.
		expect(await trustFile(home)).toEqual({ [sibling]: true });
	});

	test("trusting the parent records the parent and drops this folder's own record", async () => {
		const { home, root } = await scratch();
		const parent = join(root, "parent");
		await mkdir(parent);
		const project = await gated(parent);
		await setProjectTrust(home, project, "trust");

		const status = await setProjectTrust(home, project, "trust-parent");

		expect(status).toMatchObject({ trusted: true, decidedHere: false, parent });
		expect(await trustFile(home)).toEqual({ [parent]: true });
		expect(await decideProjectTrust({ cwd: project, home })).toBe(true);
	});
});

describe("project trust", () => {
	test("a folder pi gates nothing in is trusted with no decision and no record", async () => {
		const { home, project } = await scratch();
		let called = false;
		const trusted = await decideProjectTrust({
			cwd: project,
			home,
			extensions: [
				{
					path: "policy.js",
					handlers: [
						() => {
							called = true;
							return { trusted: "no" };
						},
					],
				},
			],
		});

		expect(trusted).toBe(true);
		expect(called).toBe(false);
		expect(projectTrustStore(home).get(project)).toBeNull();
		expect(await readFile(join(home.dir, "trust.json"), "utf8").catch(() => undefined)).toBe(
			undefined,
		);
	});

	test("an extension's no refuses a folder the store says yes to, and remembers it", async () => {
		const { home, root } = await scratch();
		const project = await gated(root);
		projectTrustStore(home).set(project, true);

		const trusted = await decideProjectTrust({
			cwd: project,
			home,
			extensions: [{ path: "policy.js", handlers: [() => ({ trusted: "no", remember: true })] }],
		});

		expect(trusted).toBe(false);
		expect(projectTrustStore(home).get(project)).toBe(false);
		expect(JSON.parse(await readFile(join(home.dir, "trust.json"), "utf8"))).toEqual({
			[project]: false,
		});
	});

	test("a throwing handler is reported with pi's sentence, and the next answer decides", async () => {
		const { home, root } = await scratch();
		const project = await gated(root);
		projectTrustStore(home).set(project, false);
		const problems: string[] = [];

		const trusted = await decideProjectTrust({
			cwd: project,
			home,
			extensions: [
				{
					path: "broken.js",
					handlers: [
						() => {
							throw new Error("boom");
						},
					],
				},
				{
					path: "policy.js",
					handlers: [() => ({ trusted: "undecided" }), () => ({ trusted: "yes" })],
				},
			],
			onExtensionError: (message) => problems.push(message),
		});

		expect(trusted).toBe(true);
		expect(problems).toEqual(['Extension "broken.js" project_trust error: boom']);
	});

	test("defaultProjectTrust decides a folder with no saved record", async () => {
		const always = await scratch();
		await setDefault(always.home, "always");
		expect(await decideProjectTrust({ cwd: await gated(always.root), home: always.home })).toBe(
			true,
		);

		const never = await scratch();
		await setDefault(never.home, "never");
		expect(await decideProjectTrust({ cwd: await gated(never.root), home: never.home })).toBe(
			false,
		);
	});

	test("a saved decision outranks the default, and ask stays undecided until the gate answers", async () => {
		const saved = await scratch();
		await setDefault(saved.home, "never");
		const savedProject = await gated(saved.root);
		projectTrustStore(saved.home).set(savedProject, true);
		expect(await decideProjectTrust({ cwd: savedProject, home: saved.home })).toBe(true);

		const asked = await scratch();
		expect(await decideProjectTrust({ cwd: await gated(asked.root), home: asked.home })).toBe(
			false,
		);
	});
});
