/**
 * A theme in a host with no terminal. pi's `theme` value is not exported, so the
 * host answers with a no-op; what matters is that reading it does not throw,
 * because pi counts a failed handler as blocking and an extension colours its
 * status line without asking.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ServerFrame } from "shared";

import { agentHome } from "../../platform/agent-home";
import { SessionRegistry } from "./registry";

/** An operator extension that colours a status line, as a progress reporter does. */
const painter = `
export default function painter(pi) {
	pi.registerCommand("paint", {
		description: "Set a coloured status",
		handler: async (_args, ctx) => {
			ctx.ui.setStatus("colour", ctx.ui.theme.fg("accent", "painted"));
		},
	});
}
`;

describe("an extension that reads the theme", () => {
	test("still delivers the status it coloured", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-theme-"));
		const home = agentHome(dir);
		await mkdir(join(dir, "extensions"), { recursive: true });
		await mkdir(home.chatsDir, { recursive: true });
		await writeFile(join(dir, "extensions", "painter.ts"), painter, "utf8");
		const registry = new SessionRegistry(home);
		const started = crypto.randomUUID();
		try {
			const session = await registry.ensure(started, { kind: "chat" });
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			try {
				await session.run({ type: "prompt", text: "/paint" });
			} finally {
				unsubscribe();
			}

			const status = frames.find(
				(frame) =>
					frame.t === "ui" &&
					frame.request.method === "setStatus" &&
					frame.request.statusKey === "colour",
			);
			expect(status).toEqual({
				t: "ui",
				sessionId: started,
				request: { method: "setStatus", statusKey: "colour", statusText: "painted" },
			});
			// A host that refuses `theme` reports it, and the notice would be the only
			// trace of a status an extension believed it had shown.
			const refused = frames.some(
				(frame) =>
					frame.t === "ui" &&
					frame.request.method === "notify" &&
					frame.request.notifyType === "warning",
			);
			expect(refused).toBe(false);
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
