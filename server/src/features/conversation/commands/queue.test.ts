/**
 * Taking queued prompts back. pi exposes `clearQueue()` for exactly this, and a
 * host that aborted without returning the text would throw away what the user
 * typed while the run was going. This drives the real handlers against a real
 * engine, so pi's own queue is what answers.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PromptQueue } from "shared";

import { agentHome } from "../../../platform/agent-home";
import type { AgentHome } from "../../../platform/agent-home";
import { SessionHost } from "../host/host";
import type { CommandTarget } from "./context";
import { runCommand } from "./index";

const scratch = async (): Promise<{ dir: string; home: AgentHome; host: SessionHost }> => {
	const dir = await mkdtemp(join(tmpdir(), "epsilon-queue-"));
	const home = agentHome(dir);
	await mkdir(home.chatsDir, { recursive: true });
	const host = await SessionHost.open({
		home,
		cwd: home.chatsDir,
		sessionId: crypto.randomUUID(),
		file: undefined,
		chat: true,
	});
	return { dir, home, host };
};

/** A target whose queue is what the test watches; everything else is the real engine. */
const targetOf = (host: SessionHost, home: AgentHome, returned: PromptQueue[]): CommandTarget => ({
	agent: host.session,
	host,
	home,
	models: [],
	cancelDialogs: () => undefined,
	notice: () => undefined,
	fail: () => undefined,
	resync: () => undefined,
	reload: async () => undefined,
	reloadFromDisk: async () => undefined,
	returnQueue: (queue) => returned.push(queue),
});

describe("a queue of prompts", () => {
	test("an abort hands every queued prompt back, and pi keeps none", async () => {
		const { dir, home, host } = await scratch();
		const returned: PromptQueue[] = [];
		try {
			await host.session.steer("queued steering text");
			await host.session.followUp("queued follow-up");
			expect(host.session.pendingMessageCount).toBe(2);

			await runCommand(targetOf(host, home, returned), { type: "abort" });
			expect(returned).toEqual([
				{ steering: ["queued steering text"], followUp: ["queued follow-up"] },
			]);
			expect(host.session.pendingMessageCount).toBe(0);
		} finally {
			await host.close();
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("Clear hands them back too, and an empty queue hands nothing", async () => {
		const { dir, home, host } = await scratch();
		const returned: PromptQueue[] = [];
		try {
			await runCommand(targetOf(host, home, returned), { type: "clear_queue" });
			expect(returned).toHaveLength(0);

			await host.session.steer("only this one");
			await runCommand(targetOf(host, home, returned), { type: "clear_queue" });
			expect(returned).toEqual([{ steering: ["only this one"], followUp: [] }]);
			expect(host.session.pendingMessageCount).toBe(0);
		} finally {
			await host.close();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
