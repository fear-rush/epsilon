/**
 * The Settings read against a real engine: a skill an extension adds through
 * `resources_discover` exists only inside that engine, so the read merges it and
 * says whether there was an engine to ask.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { SessionRegistry } from "../conversation";
import { readSettings } from "./snapshot";

const realHome = process.env.HOME;
let scratch: string;

beforeAll(async () => {
	scratch = await mkdtemp(join(tmpdir(), "epsilon-settings-"));
	process.env.HOME = join(scratch, "user");
});

afterAll(() => {
	process.env.HOME = realHome;
});

/** An operator extension that lends pi one extra skills folder at startup. */
const discoverer = (skillDir: string) => `
export default function discoverer(pi) {
	pi.on("resources_discover", () => ({ skillPaths: [${JSON.stringify(skillDir)}] }));
}
`;

const scratchHome = async () => {
	const dir = await mkdtemp(join(scratch, "case-"));
	const home = agentHome(dir);
	await mkdir(home.chatsDir, { recursive: true });
	const skills = join(dir, "extra-skills");
	await mkdir(join(skills, "discovered"), { recursive: true });
	await writeFile(
		join(skills, "discovered", "SKILL.md"),
		"---\nname: discovered\ndescription: Added at runtime\n---\n\nDo the thing.\n",
	);
	await mkdir(join(dir, "extensions"), { recursive: true });
	await writeFile(join(dir, "extensions", "discoverer.ts"), discoverer(skills), "utf8");
	return { dir, home };
};

describe("skills from an extension", () => {
	test("appear in the Settings read while an engine is open", async () => {
		const { dir, home } = await scratchHome();
		const registry = new SessionRegistry(home);
		try {
			await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const snapshot = await readSettings(home.chatsDir, home, join(dir, "user"), registry);
			expect(snapshot.skills.find((skill) => skill.name === "discovered")).toMatchObject({
				origin: "extension",
				scope: "user",
				editable: false,
				toggle: "none",
				status: "active",
			});
			expect(snapshot.skillsLive).toBe(true);
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("say the list is file-based when no engine is open", async () => {
		const { dir, home } = await scratchHome();
		const registry = new SessionRegistry(home);
		try {
			const snapshot = await readSettings(home.chatsDir, home, join(dir, "user"), registry);
			expect(snapshot.skillsLive).toBe(false);
			expect(snapshot.skills.some((skill) => skill.origin === "extension")).toBe(false);
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
