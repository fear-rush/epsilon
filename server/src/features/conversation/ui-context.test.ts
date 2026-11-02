/**
 * pi's `ExtensionUIContext` reaching the browser without a terminal: a theme an
 * extension reads without asking, and a prompt whose caller withdraws it.
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

/**
 * An extension that starts a prompt and then abandons it, as the MCP sign-in does
 * when its caller gives up. Without the signal the dialog would stay open until a
 * person answered, and the extension's next line would never run.
 */
const abandons = `
export default function abandons(pi) {
	pi.registerCommand("ask", {
		description: "Ask, then withdraw the question",
		handler: async (_args, ctx) => {
			const controller = new AbortController();
			setTimeout(() => controller.abort(), 50);
			const answer = await ctx.ui.input("Name?", "type here", { signal: controller.signal });
			ctx.ui.notify(\`answer:\${answer}\`, "info");
		},
	});
}
`;

describe("an extension that aborts its prompt", () => {
	test("closes the dialog and reads the method's default", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-abort-"));
		const home = agentHome(dir);
		await mkdir(join(dir, "extensions"), { recursive: true });
		await mkdir(home.chatsDir, { recursive: true });
		await writeFile(join(dir, "extensions", "abandons.ts"), abandons, "utf8");
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			try {
				await session.run({ type: "prompt", text: "/ask" });
			} finally {
				unsubscribe();
			}

			const asked = frames.find((frame) => frame.t === "dialog");
			if (asked?.t !== "dialog") throw new Error("the extension never asked");
			const closed = frames.find(
				(frame) => frame.t === "dialog-closed" && frame.id === asked.request.id,
			);
			expect(closed).toBeDefined();
			const notice = frames.find((frame) => frame.t === "ui" && frame.request.method === "notify");
			if (notice?.t !== "ui" || notice.request.method !== "notify") {
				throw new Error("the extension never reported the answer");
			}
			expect(notice.request.message).toBe("answer:undefined");
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
