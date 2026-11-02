/**
 * A session whose recorded folder was deleted. pi opens the same file with a folder
 * chosen for that run and leaves the header alone; the catalog has to say the folder
 * is gone so the page can ask instead of failing. A chosen folder can never redirect a
 * session whose own folder still exists.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { listAllSessions, locateSession } from "../../platform/pi";
import { groupSessions } from "../sessions";
import { openSessionManager } from "./host/factory";
import { SessionRegistry } from "./registry";

const scratch = async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "epsilon-missing-folder-")));
	const home = agentHome(join(root, "home"));
	await mkdir(home.chatsDir, { recursive: true });
	// A flat store so the test does not depend on pi's process-wide agent dir.
	await writeFile(
		join(home.dir, "settings.json"),
		JSON.stringify({ sessionDir: join(root, "sessions") }),
	);
	return { root, home };
};

const sessionIn = (root: string, home: ReturnType<typeof agentHome>, project: string) => {
	const id = crypto.randomUUID();
	const manager = openSessionManager(project, id, undefined, home);
	if (manager.getSessionFile() === undefined) throw new Error("pi created no session file");
	manager.appendMessage({ role: "user", content: "hi", timestamp: Date.now() });
	return { id, file: manager.getSessionFile() ?? join(root, "missing") };
};

describe("a session whose folder is gone", () => {
	test("is flagged in the list and opens where the operator chose", async () => {
		const { root, home } = await scratch();
		const registry = new SessionRegistry(home);
		try {
			const project = join(root, "project");
			await mkdir(project);
			const { id } = sessionIn(root, home, project);
			await rm(project, { recursive: true, force: true });

			const list = await groupSessions(home, await listAllSessions(home), [], new Set());
			const row = list.projects.flatMap((entry) => entry.sessions).find((s) => s.id === id);
			expect(row).toMatchObject({ cwd: project, cwdMissing: true });

			const session = await registry.ensure(id, { kind: "chat" });
			expect(session.place).toEqual({ kind: "chat" });
			// The file keeps the old folder; the choice was for this open only.
			expect((await locateSession(id, home))?.cwd).toBe(project);
		} finally {
			await registry.disposeAll();
			await rm(root, { recursive: true, force: true });
		}
	});

	test("without a chosen folder it refuses with a sentence instead of moving", async () => {
		const { root, home } = await scratch();
		const registry = new SessionRegistry(home);
		try {
			const project = join(root, "project");
			await mkdir(project);
			const { id } = sessionIn(root, home, project);
			await rm(project, { recursive: true, force: true });

			await expect(registry.ensure(id)).rejects.toThrow(
				`This chat's folder no longer exists: ${project}. Choose a folder to continue in.`,
			);
		} finally {
			await registry.disposeAll();
			await rm(root, { recursive: true, force: true });
		}
	});

	test("a healthy session ignores a folder chosen for it", async () => {
		const { root, home } = await scratch();
		const registry = new SessionRegistry(home);
		try {
			const recorded = join(root, "recorded");
			const chosen = join(root, "chosen");
			await mkdir(recorded);
			await mkdir(chosen);
			const { id } = sessionIn(root, home, recorded);

			const session = await registry.ensure(id, { kind: "project", path: chosen });
			expect(session.place).toEqual({ kind: "project", path: recorded });
		} finally {
			await registry.disposeAll();
			await rm(root, { recursive: true, force: true });
		}
	});
});
