/**
 * pi records a settings file it could not load and ignores it. A chat must say so
 * once, before the operator mistakes pi's fallback for their own choice.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerFrame } from "shared";

import { agentHome } from "../../platform/agent-home";
import { SessionRegistry } from "./registry";

describe("a settings file pi cannot load", () => {
	test("is reported once, with the file's name, when a chat starts", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-settings-notice-"));
		const home = agentHome(dir);
		await mkdir(home.chatsDir, { recursive: true });
		// Valid JSON of the wrong shape: pi's manager parses it, then refuses it.
		await writeFile(join(dir, "settings.json"), JSON.stringify("not an object"), "utf8");
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			unsubscribe();
			const reported = frames.filter((frame) => frame.t === "notice" && frame.kind === "settings");
			expect(reported).toHaveLength(1);
			const notice = reported[0];
			if (notice?.t !== "notice") throw new Error("expected a notice frame");
			expect(notice.text).toContain("settings.json");
			expect(notice.text).toContain("could not be loaded");
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
