/**
 * The whole pipeline against real temporary folders. The network ports are
 * stubbed; the one test that runs the real `skills` CLI needs
 * EPSILON_NETWORK_TESTS=1.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { gzipSync, zipSync } from "fflate";

import { agentHome } from "../../platform/agent-home";
import { settingsManager, trustProject } from "../../platform/pi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SKILLS_CLI_VERSION, runSkillsCli } from "./cli";
import { skillImportRoutes } from "./routes";
import {
	StageGoneError,
	commitImport,
	discard,
	restrictPackageSkills,
	stageReport,
	stageSource,
	stageUpload,
} from "./service";
import type { ImportContext, ImportPorts } from "./service";
import { stagePaths } from "./store";

const SKILL = (name: string, extra = "") =>
	`---\nname: ${name}\ndescription: The ${name} skill\n${extra}---\n\nInstructions for ${name}.\n`;

const scratch = async () => {
	const dir = await mkdtemp(join(tmpdir(), "epsilon-import-"));
	const home = agentHome(join(dir, "home"));
	await mkdir(home.dir, { recursive: true });
	const context: ImportContext = { home, userHome: join(dir, "user"), project: undefined };
	return { dir, home, context };
};

const bytes = (text: string) => new TextEncoder().encode(text);
const upload = (name: string, text: string) => ({ name, bytes: bytes(text) });

/** A tar archive, written by hand so the tests do not depend on a tar binary. */
const tar = (entries: { path: string; body?: string; type?: string; mode?: number }[]) => {
	const blocks: Uint8Array[] = [];
	for (const entry of entries) {
		const body = bytes(entry.body ?? "");
		const header = new Uint8Array(512);
		const put = (text: string, at: number) => header.set(bytes(text), at);
		put(entry.path, 0);
		put(`${(entry.mode ?? 0o644).toString(8).padStart(7, "0")}\0`, 100);
		put(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
		put(entry.type ?? "0", 156);
		put("ustar\0", 257);
		blocks.push(header, body, new Uint8Array((512 - (body.length % 512)) % 512));
	}
	blocks.push(new Uint8Array(1024));
	const out = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0));
	let at = 0;
	for (const block of blocks) {
		out.set(block, at);
		at += block.length;
	}
	return out;
};

describe("folder upload", () => {
	test("stages a picked folder and reports its skill", async () => {
		const { context } = await scratch();
		const report = await stageUpload(context, [
			upload("probe/SKILL.md", SKILL("probe")),
			upload("probe/references/a.md", "ref"),
			upload("probe/.git/config", "x"),
			upload("probe/node_modules/p/i.js", "x"),
			upload("probe/.DS_Store", "x"),
		]);
		expect(report.source).toBe("probe (folder)");
		expect(report.candidates).toHaveLength(1);
		const [candidate] = report.candidates;
		expect(candidate?.name).toBe("probe");
		expect(candidate?.dir).toBe("probe");
		expect(candidate?.files.map((item) => item.path)).toEqual(["SKILL.md", "references/a.md"]);
		expect(candidate?.removed.toSorted()).toEqual([".DS_Store", ".git", "node_modules"]);
		expect(candidate?.errors).toEqual([]);
		expect(report.packageOption.available).toBe(false);
	});

	test("refuses a path that climbs out of the stage", async () => {
		const { context, home } = await scratch();
		await expect(
			stageUpload(context, [upload("a/SKILL.md", SKILL("a")), upload("a/../../escape.txt", "x")]),
		).rejects.toThrow(/climbs out/);
		await expect(stageUpload(context, [upload("/etc/passwd", "x")])).rejects.toThrow(/absolute/);
		// A refused stage leaves nothing behind.
		const left = await readdir(join(home.dir, "tmp", "skill-import")).catch(() => []);
		expect(left).toEqual([]);
	});

	test("a source with no SKILL.md is refused", async () => {
		const { context } = await scratch();
		await expect(stageUpload(context, [upload("README.md", "hi")])).rejects.toThrow(/No SKILL.md/);
	});

	test("the upload size limit applies", async () => {
		const { context } = await scratch();
		const big = { name: "x/big.bin", bytes: new Uint8Array(51 * 1024 * 1024) };
		await expect(stageUpload(context, [big])).rejects.toThrow(/limit is 50 MB/);
	});
});

describe("archive upload", () => {
	test("zip, tar and tgz all stage the same skill", async () => {
		const { context } = await scratch();
		const files = { "probe/SKILL.md": SKILL("probe"), "probe/scripts/run.sh": "#!/bin/sh\n" };
		const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, bytes(v)])));
		const plain = tar([
			{ path: "probe/SKILL.md", body: files["probe/SKILL.md"] },
			{ path: "probe/scripts/run.sh", body: files["probe/scripts/run.sh"], mode: 0o755 },
		]);
		for (const [name, data] of [
			["probe.zip", zip],
			["probe.tar", plain],
			["probe.tar.gz", gzipSync(plain)],
			["probe.tgz", gzipSync(plain)],
		] as const) {
			const report = await stageUpload(context, [{ name, bytes: data }]);
			expect(report.source).toBe(name);
			expect(report.candidates[0]?.name).toBe("probe");
			expect(report.candidates[0]?.scripts).toEqual(["scripts/run.sh"]);
		}
	});

	test("zip-slip entries are refused", async () => {
		const { context } = await scratch();
		const zip = zipSync({ "../../evil.txt": bytes("x"), "a/SKILL.md": bytes(SKILL("a")) });
		await expect(stageUpload(context, [{ name: "a.zip", bytes: zip }])).rejects.toThrow(
			/climbs out/,
		);
		const absolute = tar([{ path: "/tmp/evil.txt", body: "x" }]);
		await expect(stageUpload(context, [{ name: "a.tar", bytes: absolute }])).rejects.toThrow(
			/absolute/,
		);
	});

	test("links in a tar are dropped and reported as an error on their skill", async () => {
		const { context } = await scratch();
		const archive = tar([
			{ path: "a/SKILL.md", body: SKILL("a") },
			{ path: "a/passwd", type: "2" },
		]);
		const report = await stageUpload(context, [{ name: "a.tar", bytes: archive }]);
		expect(report.candidates[0]?.errors.map((item) => item.code)).toEqual(["symlink"]);
	});

	test("a damaged archive says so", async () => {
		const { context } = await scratch();
		await expect(
			stageUpload(context, [{ name: "a.zip", bytes: bytes("PK\u0003\u0004 not really") }]),
		).rejects.toThrow(/could not be unpacked/);
	});
});

const fakePorts = (layout: Record<string, string>): ImportPorts => ({
	fetchSource: async (_parsed, cwd) => {
		for (const [path, text] of Object.entries(layout)) {
			await mkdir(join(cwd, path, ".."), { recursive: true });
			await writeFile(join(cwd, path), text);
		}
	},
	probeRepo: async () => ({ paths: ["skills/a/SKILL.md"], packageJson: undefined }),
});

describe("pasted source", () => {
	test("stages what the fetcher wrote and offers the package option for GitHub", async () => {
		const { context } = await scratch();
		const ports = fakePorts({
			".agents/skills/a/SKILL.md": SKILL("a"),
			".git/HEAD": "ref",
			"skills-lock.json": "{}",
		});
		const report = await stageSource(context, "npx skills add owner/repo -s a", ports);
		expect(report.source).toBe("owner/repo");
		expect(report.candidates.map((item) => item.name)).toEqual(["a"]);
		expect(report.packageOption).toEqual({
			available: true,
			source: "git:github.com/owner/repo",
			reason: expect.any(String),
		});
	});

	test("a repository with no skills/ or pi manifest cannot be a package", async () => {
		const { context } = await scratch();
		const ports: ImportPorts = {
			...fakePorts({ ".agents/skills/a/SKILL.md": SKILL("a") }),
			probeRepo: async () => ({ paths: ["README.md"], packageJson: '{"name":"x"}' }),
		};
		const report = await stageSource(context, "owner/repo", ports);
		expect(report.packageOption.available).toBe(false);
		expect(report.packageOption.reason).toContain("skills/ folder");
	});

	test("a probe that fails does not fail the import", async () => {
		const { context } = await scratch();
		const ports: ImportPorts = {
			...fakePorts({ ".agents/skills/a/SKILL.md": SKILL("a") }),
			probeRepo: async () => {
				throw new Error("offline");
			},
		};
		const report = await stageSource(context, "owner/repo", ports);
		expect(report.candidates).toHaveLength(1);
		expect(report.packageOption.available).toBe(false);
		expect(report.packageOption.reason).toContain("offline");
	});

	test("a failing fetch leaves no stage and passes the message on", async () => {
		const { context, home } = await scratch();
		const ports: ImportPorts = {
			...fakePorts({}),
			fetchSource: async () => {
				throw new Error("The skills installer failed: no such repo");
			},
		};
		await expect(stageSource(context, "owner/repo", ports)).rejects.toThrow(/no such repo/);
		expect(await readdir(join(home.dir, "tmp", "skill-import"))).toEqual([]);
	});

	test("a bad command never reaches the fetcher", async () => {
		const { context } = await scratch();
		const ports: ImportPorts = {
			...fakePorts({}),
			fetchSource: async () => {
				throw new Error("must not run");
			},
		};
		await expect(stageSource(context, "npx skills remove foo", ports)).rejects.toThrow(
			/different command/,
		);
	});
});

describe("commit", () => {
	const staged = async (names: string[] = ["a"]) => {
		const env = await scratch();
		const report = await stageUpload(
			env.context,
			names.map((name) => upload(`${name}/SKILL.md`, SKILL(name))),
		);
		return { ...env, report };
	};
	const body = (overrides = {}) => ({
		skills: ["a"],
		target: "global" as const,
		replace: [],
		mode: "copy" as const,
		...overrides,
	});

	test("copies the chosen skills into the home and deletes the stage", async () => {
		const { context, home, report } = await staged(["a", "b"]);
		await commitImport(context, report.stageId, body());
		expect(await readFile(join(home.skillsDir, "a", "SKILL.md"), "utf8")).toContain("name: a");
		expect(await readdir(home.skillsDir)).toEqual(["a"]);
		await expect(stat(stagePaths(home, report.stageId).dir)).rejects.toThrow();
		await expect(commitImport(context, report.stageId, body())).rejects.toBeInstanceOf(
			StageGoneError,
		);
	});

	test("refuses a name that already exists unless it is replaced", async () => {
		const { context, home, report } = await staged();
		await mkdir(join(home.skillsDir, "a"), { recursive: true });
		await writeFile(join(home.skillsDir, "a", "old.txt"), "old");
		await expect(commitImport(context, report.stageId, body())).rejects.toThrow(
			/already installed/,
		);
		expect(await readdir(join(home.skillsDir, "a"))).toEqual(["old.txt"]);

		await commitImport(context, report.stageId, body({ replace: ["a"] }));
		expect(await readdir(join(home.skillsDir, "a"))).toEqual(["SKILL.md"]);
		expect(await readdir(home.skillsDir)).toEqual(["a"]);
	});

	test("the existing skill is reported on the candidate", async () => {
		const { context, home, report } = await staged();
		await mkdir(join(home.skillsDir, "a"), { recursive: true });
		const again = await stageReport(context, report.stageId);
		expect(again.candidates[0]?.existing).toEqual({ global: true, project: false });
	});

	test("refuses a skill with errors, and a name that is not in the source", async () => {
		const env = await scratch();
		const report = await stageUpload(env.context, [
			upload("bad/SKILL.md", "---\nname: other\ndescription: d\n---\nBody\n"),
		]);
		await expect(
			commitImport(env.context, report.stageId, body({ skills: ["other"] })),
		).rejects.toThrow(/must equal the folder name/);
		await expect(
			commitImport(env.context, report.stageId, body({ skills: ["missing"] })),
		).rejects.toThrow(/not one of the skills/);
		expect(await readdir(env.home.skillsDir).catch(() => [])).toEqual([]);
	});

	test("a project target needs a project, and lands in .agents/skills", async () => {
		const { context, dir, report } = await staged();
		await expect(
			commitImport(context, report.stageId, body({ target: "project" })),
		).rejects.toThrow(/Pick a project/);
		const project = join(dir, "project");
		await mkdir(project);
		trustProject(context.home, project);
		await commitImport({ ...context, project }, report.stageId, body({ target: "project" }));
		expect(await readFile(join(project, ".agents", "skills", "a", "SKILL.md"), "utf8")).toContain(
			"name: a",
		);
	});

	test("a package install is refused when the source is not a package", async () => {
		const { context, report } = await staged();
		await expect(commitImport(context, report.stageId, body({ mode: "package" }))).rejects.toThrow(
			/cannot be installed as a package/,
		);
	});

	test("discard deletes a stage", async () => {
		const { context, home, report } = await staged();
		await discard(context, report.stageId);
		await expect(stat(stagePaths(home, report.stageId).dir)).rejects.toThrow();
	});

	test("an old stage is swept when a new one is created", async () => {
		const { context, home, report } = await staged();
		const { utimes } = await import("node:fs/promises");
		const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
		await utimes(stagePaths(home, report.stageId).dir, old, old);
		await stageUpload(context, [upload("b/SKILL.md", SKILL("b"))]);
		await expect(stat(stagePaths(home, report.stageId).dir)).rejects.toThrow();
	});

	test("symlinks written by the fetcher are errors, never followed", async () => {
		const env = await scratch();
		const ports: ImportPorts = {
			...fakePorts({ ".agents/skills/a/SKILL.md": SKILL("a") }),
			fetchSource: async (_parsed, cwd) => {
				await mkdir(join(cwd, ".agents", "skills", "a"), { recursive: true });
				await writeFile(join(cwd, ".agents", "skills", "a", "SKILL.md"), SKILL("a"));
				await symlink("/etc/passwd", join(cwd, ".agents", "skills", "a", "pw"));
			},
		};
		const report = await stageSource(env.context, "owner/repo", ports);
		expect(report.candidates[0]?.errors.map((item) => item.code)).toEqual(["symlink"]);
	});
});

describe("package filter", () => {
	test("restrictPackageSkills narrows a declared package to the chosen skills", async () => {
		const { dir, home } = await scratch();
		const folder = join(dir, "work");
		await mkdir(folder);
		const settings = settingsManager(folder, home);
		settings.setPackages(["git:github.com/Owner/Repo.git@v1", "npm:other"]);
		await settings.flush();
		await restrictPackageSkills(settings, "git:github.com/owner/repo", ["a", "b"], false);
		const written: unknown = JSON.parse(await readFile(join(home.dir, "settings.json"), "utf8"));
		expect(written).toMatchObject({
			packages: [{ source: "git:github.com/Owner/Repo.git@v1", skills: ["a", "b"] }, "npm:other"],
		});
	});

	test("it says so when the package was not declared", async () => {
		const { dir, home } = await scratch();
		await expect(
			restrictPackageSkills(settingsManager(dir, home), "git:github.com/o/r", ["a"], false),
		).rejects.toThrow(/did not declare/);
	});
});

describe("routes", () => {
	const app = async (ports: ImportPorts) => {
		const { home, dir } = await scratch();
		const deps = { home, userHome: join(dir, "user"), engines: { reloadAll: () => undefined } };
		return { home, app: new OpenAPIHono().route("/", skillImportRoutes(deps, ports)) };
	};

	test("upload, commit and discard through HTTP", async () => {
		const { app: server, home } = await app(fakePorts({}));
		const form = new FormData();
		form.append("files", new File([SKILL("probe")], "probe/SKILL.md"));
		form.append("files", new File(["ref"], "probe/references/a.md"));
		const staged = await server.request("/api/settings/skills/import/upload", {
			method: "POST",
			body: form,
		});
		expect(staged.status).toBe(200);
		const report: { stageId: string; candidates: { files: unknown[] }[] } = await staged.json();
		expect(report.candidates[0]?.files).toHaveLength(2);

		const commit = await server.request(`/api/settings/skills/import/${report.stageId}/commit`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ skills: ["probe"], target: "global" }),
		});
		expect(commit.status).toBe(204);
		expect((await readdir(join(home.skillsDir, "probe"))).toSorted()).toEqual([
			"SKILL.md",
			"references",
		]);

		const again = await server.request(`/api/settings/skills/import/${report.stageId}/commit`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ skills: ["probe"], target: "global" }),
		});
		expect(again.status).toBe(404);
		expect(await again.json()).toEqual({
			message: "This import has expired. Choose the source again",
		});

		const gone = await server.request(`/api/settings/skills/import/${report.stageId}`, {
			method: "DELETE",
		});
		expect(gone.status).toBe(204);
	});

	test("a pasted source and a refusal use the documented shape", async () => {
		const { app: server } = await app(fakePorts({ ".agents/skills/a/SKILL.md": SKILL("a") }));
		const ok = await server.request("/api/settings/skills/import/source", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ input: "npx skills add owner/repo" }),
		});
		expect(ok.status).toBe(200);
		const refused = await server.request("/api/settings/skills/import/source", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ input: "npx skills init" }),
		});
		expect(refused.status).toBe(400);
		expect(Object.keys(await refused.json())).toEqual(["message"]);
	});
});

test.skipIf(process.env.EPSILON_NETWORK_TESTS !== "1")(
	`the real skills CLI ${SKILLS_CLI_VERSION} fetches a skill into the stage`,
	async () => {
		const { context } = await scratch();
		const report = await stageSource(context, "vercel-labs/agent-skills -s web-design-guidelines", {
			fetchSource: runSkillsCli,
			probeRepo: async () => ({ paths: [], packageJson: undefined }),
		});
		expect(report.candidates.map((item) => item.name)).toEqual(["web-design-guidelines"]);
	},
	180_000,
);
