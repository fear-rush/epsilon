/**
 * The built-in command router against a real engine. pi itself has no dispatch for
 * these names, so what is checked here is that the host answers them and that
 * anything else still reaches `prompt()`.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../../platform/agent-home";
import type { AgentHome } from "../../../platform/agent-home";
import { SessionHost } from "../host/host";
import type { BuiltinContext } from "./builtins";
import { runBuiltin } from "./index";

const scratch = async (): Promise<{ dir: string; home: AgentHome }> => {
	const dir = await mkdtemp(join(tmpdir(), "epsilon-slash-"));
	const home = agentHome(dir);
	await mkdir(home.chatsDir, { recursive: true });
	return { dir, home };
};

describe("built-in commands", () => {
	test("a name pi has runs on the engine; anything else stays a prompt", async () => {
		const { dir, home } = await scratch();
		const host = await SessionHost.open({
			home,
			cwd: home.chatsDir,
			sessionId: crypto.randomUUID(),
			file: undefined,
			chat: true,
		});
		const notices: string[] = [];
		const context: BuiltinContext = {
			host,
			home,
			reload: async () => undefined,
			notice: (text) => notices.push(text),
		};
		try {
			// The host's own row: pi's operation runs and the name changes.
			expect(await runBuiltin(context, "/name Draft")).toBe(true);
			expect(host.session.sessionName).toBe("Draft");

			// pi refuses an empty compaction; the tab hears pi's reason, and the text
			// never becomes a turn.
			expect(host.session.messages).toHaveLength(0);
			expect(await runBuiltin(context, "/compact")).toBe(true);
			expect(notices.at(-1) ?? "").toContain("Nothing to compact");

			// A row the browser owns answers with its sentence rather than prompting.
			expect(await runBuiltin(context, "/share")).toBe(true);
			expect(notices.at(-1) ?? "").toContain("pi /share");

			// An extension command, a template, a path and a skill entry are all still prompts.
			// A skill command reaches pi even when `enableSkillCommands` keeps it out of the palette.
			expect(await runBuiltin(context, "/permission auto")).toBe(false);
			expect(await runBuiltin(context, "/tmp/notes.md")).toBe(false);
			expect(await runBuiltin(context, "/skill:probe")).toBe(false);
			expect(host.session.messages).toHaveLength(0);
		} finally {
			await host.close();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
