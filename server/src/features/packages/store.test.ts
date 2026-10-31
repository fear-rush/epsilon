/**
 * A local path package is declared by its path and holds a `skills/` folder, the
 * way `pi install ./path` accepts it. The read groups pi's resolver by source and
 * never installs.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { installPackage, listPackages, packageResources } from "./store";

const realHome = process.env.HOME;
let scratch: string;

beforeAll(async () => {
	scratch = await mkdtemp(join(tmpdir(), "epsilon-packages-"));
	process.env.HOME = join(scratch, "user");
});

afterAll(() => {
	process.env.HOME = realHome;
});

describe("package resources", () => {
	test("groups the skills a local package provides", async () => {
		const home = agentHome(join(scratch, "agent"));
		await mkdir(home.chatsDir, { recursive: true });
		const pkg = join(scratch, "pkg");
		await mkdir(join(pkg, "skills", "greet"), { recursive: true });
		await writeFile(
			join(pkg, "skills", "greet", "SKILL.md"),
			"---\nname: greet\ndescription: Say hello\n---\n\nHello\n",
		);
		await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "pkg" }));

		await installPackage(home.chatsDir, home, pkg, "user");
		// pi stores a path relative to the settings file; the read takes it as listed.
		const [declared] = listPackages(home.chatsDir, home);
		expect(declared?.scope).toBe("user");
		const source = declared?.source ?? "";

		const resources = await packageResources(home.chatsDir, home, source, "user");
		expect(resources.skills.map((entry) => entry.name)).toEqual(["greet"]);
		expect(resources.skills[0]?.enabled).toBe(true);
		expect(resources.extensions).toEqual([]);

		const other = await packageResources(home.chatsDir, home, "nope", "user");
		expect(other.skills).toEqual([]);
	});
});
