/**
 * What a tab receives on attach, read from a real engine: pi's cache-warmer state,
 * the token counters, and the command palette every other surface draws from.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serverFrameSchema, snapshotSchema } from "shared";
import type { ServerFrame } from "shared";

import { agentHome } from "../../platform/agent-home";
import { settingsManager } from "../../platform/pi";
import { SessionRegistry } from "./registry";

/** The snapshot frame a new tab gets from an engine in this registry. */
const snapshotFrameOf = async (registry: SessionRegistry) => {
	const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
	const frames: ServerFrame[] = [];
	session.subscribe((frame) => frames.push(frame))();
	const frame = frames.find((item) => item.t === "snapshot");
	if (frame?.t !== "snapshot") throw new Error("expected a snapshot frame");
	return frame;
};

/** The snapshot alone, for a test that reads its fields. */
const snapshotOf = async (registry: SessionRegistry) => (await snapshotFrameOf(registry)).snapshot;

describe("a snapshot", () => {
	test("carries pi's cache warmer state and its token counters", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-snapshot-"));
		const home = agentHome(dir);
		await mkdir(home.chatsDir, { recursive: true });
		const registry = new SessionRegistry(home);
		try {
			const snapshot = await snapshotOf(registry);
			// pi reports a state before the first request, and the tab must receive it.
			expect(snapshot.state.cacheWarming).toEqual({
				state: "inactive",
				reason: "waiting for first request",
			});
			// The four counters are always there, so the meter can draw them at any time.
			expect(snapshot.state.stats.tokens).toEqual({
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0,
			});
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("leaves skill commands out of the palette when the setting is off", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-skill-commands-"));
		const home = agentHome(dir);
		await mkdir(home.chatsDir, { recursive: true });
		await mkdir(join(home.skillsDir, "probe"), { recursive: true });
		await writeFile(
			join(home.skillsDir, "probe", "SKILL.md"),
			"---\nname: probe\ndescription: A probe\n---\n\nBody\n",
		);
		const settings = settingsManager(home.chatsDir, home);
		settings.setEnableSkillCommands(false);
		await settings.flush();

		const registry = new SessionRegistry(home);
		try {
			const off = await snapshotOf(registry);
			expect(off.commands.some((command) => command.name === "skill:probe")).toBe(false);

			// pi's setting is read at engine start, so a second engine sees the change.
			const on = settingsManager(home.chatsDir, home);
			on.setEnableSkillCommands(true);
			await on.flush();
			const enabled = await snapshotOf(registry);
			expect(enabled.commands.some((command) => command.name === "skill:probe")).toBe(true);
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("is the frame a tab validates, field for field", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-snapshot-shape-"));
		const home = agentHome(dir);
		await mkdir(home.chatsDir, { recursive: true });
		// pi's MCP extension resolves its servers from this variable, not from the
		// engine's agentDir, so an unpublished home would read the operator's.
		const previous = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = home.dir;
		const registry = new SessionRegistry(home);
		try {
			const frame = await snapshotFrameOf(registry);
			// The server's own types do not prove the payload: a field it forgets to fill,
			// or fills with a value the tab's enum excludes, is caught here.
			expect(serverFrameSchema.safeParse(frame).success).toBe(true);
			expect(snapshotSchema.safeParse(frame.snapshot).success).toBe(true);
		} finally {
			await registry.disposeAll();
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
			await rm(dir, { recursive: true, force: true });
		}
	});
});
