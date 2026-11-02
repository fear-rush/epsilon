/**
 * pi's `sessionDir` decides where a session file is written and where the list reads
 * it. A relative value comes from the folder, and a project can name its own place,
 * which the catalog has to include or those chats vanish from the sidebar.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { agentHome } from "../../../platform/agent-home";
import { listAllSessions, locateSession } from "../../../platform/pi";
import { openSessionManager } from "./factory";

const scratch = async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "epsilon-session-dir-")));
	const home = agentHome(join(root, "home"));
	await mkdir(home.chatsDir, { recursive: true });
	return { root, home };
};

describe("the session directory", () => {
	test("a home sessionDir writes and lists there, and the default root stays empty", async () => {
		const { root, home } = await scratch();
		try {
			const custom = join(root, "custom-sessions");
			await writeFile(join(home.dir, "settings.json"), JSON.stringify({ sessionDir: custom }));
			const id = crypto.randomUUID();

			const manager = openSessionManager(home.chatsDir, id, undefined, home);
			expect(manager.getSessionDir()).toBe(custom);
			const file = manager.getSessionFile();
			if (file === undefined) throw new Error("pi created no session file");
			expect(dirname(file)).toBe(custom);
			manager.appendMessage({ role: "user", content: "hi", timestamp: Date.now() });

			expect(await locateSession(id, home)).toEqual({ file, cwd: home.chatsDir });
			expect((await listAllSessions(home)).map((session) => session.id)).toContain(id);
			expect((await locateSession(id, home))?.file.startsWith(`${home.sessionsDir}/`)).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("a project's own directory is relative to the project and reaches the catalog", async () => {
		const { root, home } = await scratch();
		try {
			const project = join(root, "project");
			await mkdir(project);
			const homeDir = join(root, "home-sessions");
			await writeFile(join(home.dir, "settings.json"), JSON.stringify({ sessionDir: homeDir }));

			// First in the home's directory, so the catalog can learn the project from its cwd.
			const firstId = crypto.randomUUID();
			const first = openSessionManager(project, firstId, undefined, home);
			expect(first.getSessionDir()).toBe(homeDir);
			first.appendMessage({ role: "user", content: "first", timestamp: Date.now() });

			await mkdir(join(project, ".pi"), { recursive: true });
			await writeFile(
				join(project, ".pi", "settings.json"),
				JSON.stringify({ sessionDir: "custom-sessions" }),
			);
			const custom = join(project, "custom-sessions");
			const secondId = crypto.randomUUID();
			const second = openSessionManager(project, secondId, undefined, home);
			expect(second.getSessionDir()).toBe(custom);
			second.appendMessage({ role: "user", content: "second", timestamp: Date.now() });

			expect((await listAllSessions(home)).map((session) => session.id)).toEqual(
				expect.arrayContaining([firstId, secondId]),
			);
			const located = await locateSession(secondId, home);
			if (located === undefined) throw new Error("the second session is not listed");
			expect(dirname(located.file)).toBe(custom);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
