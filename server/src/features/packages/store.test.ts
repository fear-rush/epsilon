/**
 * A local path package is declared by its path and holds a `skills/` folder, the
 * way `pi install ./path` accepts it. The read groups pi's resolver by source and
 * never installs. A switch is a filter in the same entry, so these checks read the
 * written `settings.json` and the inventory pi derives from it.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { writePackageEntries } from "../../platform/pi";
import { listSkills } from "../skills";
import {
	installPackage,
	listPackages,
	packageResources,
	packageUpdates,
	setPackageResource,
	updatePackage,
} from "./store";

const realHome = process.env.HOME;
let scratch: string;

beforeAll(async () => {
	scratch = await mkdtemp(join(tmpdir(), "epsilon-packages-"));
	process.env.HOME = join(scratch, "user");
});

afterAll(() => {
	process.env.HOME = realHome;
});

/** A local package with one skill folder per name, in a fresh agent home. */
const localPackage = async (name: string, skills: string[]) => {
	const base = join(scratch, name);
	const pkg = join(base, "pkg");
	await mkdir(pkg, { recursive: true });
	for (const skill of skills) {
		await mkdir(join(pkg, "skills", skill), { recursive: true });
		await writeFile(
			join(pkg, "skills", skill, "SKILL.md"),
			`---\nname: ${skill}\ndescription: The ${skill} skill\n---\n\nBody\n`,
		);
	}
	await writeFile(join(pkg, "package.json"), JSON.stringify({ name }));
	const home = agentHome(join(base, "agent"));
	await mkdir(home.chatsDir, { recursive: true });
	return { home, pkg, project: join(base, "project") };
};

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

	test("turning a package skill off writes the filter and the inventory follows", async () => {
		const { home, pkg } = await localPackage("toggle", ["greet", "quiet"]);
		await installPackage(home.chatsDir, home, pkg, "user");
		const source = listPackages(home.chatsDir, home)[0]?.source ?? "";
		const greet = (await packageResources(home.chatsDir, home, source, "user")).skills.find(
			(entry) => entry.name === "greet",
		);
		expect(greet?.enabled).toBe(true);
		const path = greet?.path ?? "";
		const pattern = relative(pkg, path);

		await setPackageResource(home.chatsDir, home, {
			source,
			scope: "user",
			type: "skills",
			path,
			enabled: false,
		});
		const stored = JSON.parse(await readFile(join(home.dir, "settings.json"), "utf8"));
		expect(stored.packages).toEqual([{ source, skills: [`-${pattern}`] }]);

		const off = await packageResources(home.chatsDir, home, source, "user");
		expect(off.skills.find((entry) => entry.name === "greet")?.enabled).toBe(false);
		expect(off.skills.find((entry) => entry.name === "quiet")?.enabled).toBe(true);
		const inventory = await listSkills(home.chatsDir, home, null);
		expect(inventory.find((entry) => entry.name === "greet")?.status).toBe("disabled");

		await setPackageResource(home.chatsDir, home, {
			source,
			scope: "user",
			type: "skills",
			path,
			enabled: true,
		});
		const back = JSON.parse(await readFile(join(home.dir, "settings.json"), "utf8"));
		expect(back.packages).toEqual([source]);
		expect(
			(await listSkills(home.chatsDir, home, null)).find((entry) => entry.name === "greet")?.status,
		).toBe("active");
	});

	test("a project delta keeps autoload and names a resource it loads with +", async () => {
		const { home, pkg, project } = await localPackage("delta", ["greet"]);
		await mkdir(project, { recursive: true });
		const path = join(pkg, "skills", "greet", "SKILL.md");
		const pattern = relative(pkg, path);
		const delta = { source: pkg, autoload: false, skills: [`-${pattern}`] };
		await writePackageEntries(project, home, "project", [delta]);

		const before = await packageResources(project, home, pkg, "project");
		expect(before.skills.map((entry) => [entry.name, entry.enabled])).toEqual([["greet", false]]);

		await setPackageResource(project, home, {
			source: pkg,
			scope: "project",
			type: "skills",
			path,
			enabled: true,
		});
		const stored = JSON.parse(await readFile(join(project, ".pi", "settings.json"), "utf8"));
		expect(stored.packages).toEqual([{ ...delta, skills: [`+${pattern}`] }]);
		expect((await packageResources(project, home, pkg, "project")).skills[0]?.enabled).toBe(true);

		await expect(
			setPackageResource(project, home, {
				source: pkg,
				scope: "project",
				type: "skills",
				path: join(pkg, "skills", "nope", "SKILL.md"),
				enabled: false,
			}),
		).rejects.toThrow(/does not provide/);
	});

	test("one row for a project entry over the user's, and inherited rows for the rest", async () => {
		const { home, project } = await localPackage("rows", []);
		await mkdir(project, { recursive: true });
		const other = join(scratch, "rows", "other");
		await writePackageEntries(home.chatsDir, home, "user", ["../pkg", other]);
		await writePackageEntries(project, home, "project", [{ source: "../../pkg", autoload: false }]);

		const rows = listPackages(project, home);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			source: "../../pkg",
			scope: "project",
			filtered: true,
			relation: "overrides",
		});
		expect(rows[1]).toMatchObject({ source: other, scope: "user", relation: "inherited" });

		// The home's own folder has no project layer, so every row is its own.
		expect(
			listPackages(home.chatsDir, home).map((entry) => [entry.source, entry.relation]),
		).toEqual([
			["../pkg", "own"],
			[other, "own"],
		]);
	});

	test("the same npm package at two versions is one row", async () => {
		const { home, project } = await localPackage("npm-rows", []);
		await mkdir(project, { recursive: true });
		await writePackageEntries(home.chatsDir, home, "user", ["npm:@scope/tool@1.2.0"]);
		await writePackageEntries(project, home, "project", ["npm:@scope/tool@2.0.0"]);

		const rows = listPackages(project, home);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			source: "npm:@scope/tool@2.0.0",
			scope: "project",
			filtered: false,
			relation: "overrides",
		});
	});

	test("an update check skips a local package, and only a declared source can be updated", async () => {
		const { home, pkg } = await localPackage("update", ["greet"]);
		await installPackage(home.chatsDir, home, pkg, "user");
		const source = listPackages(home.chatsDir, home)[0]?.source ?? "";

		// pi's checker never asks a local source for a newer version.
		expect(await packageUpdates(home.chatsDir, home)).toEqual([]);

		// pi's updater ignores a local source, and Epsilon hands it the source it declared.
		await updatePackage(home.chatsDir, home, source, "user");
		expect(JSON.parse(await readFile(join(home.dir, "settings.json"), "utf8")).packages).toEqual([
			source,
		]);

		// A source the settings do not declare never reaches a package manager.
		await expect(updatePackage(home.chatsDir, home, "npm:not-declared", "user")).rejects.toThrow(
			"No declared package matched that source",
		);
	});
});
