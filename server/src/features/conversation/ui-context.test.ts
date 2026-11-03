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

/**
 * An extension that reads the operator's draft and writes to it, which is how a
 * skill or a template fills the composer. The report the tab sends is the only
 * source: pi's own host answers an empty string there.
 */
const fills = `
export default function fills(pi) {
	pi.registerCommand("fill", {
		description: "Replace the draft, then paste into it",
		handler: async (_args, ctx) => {
			ctx.ui.setEditorText(\`read:\${ctx.ui.getEditorText()}\`);
			ctx.ui.pasteToEditor("+pasted");
		},
	});
}
`;

describe("an extension that writes into the composer", () => {
	test("reads the draft the tab reported and sends both writes", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-editor-"));
		const home = agentHome(dir);
		await mkdir(join(dir, "extensions"), { recursive: true });
		await mkdir(home.chatsDir, { recursive: true });
		await writeFile(join(dir, "extensions", "fills.ts"), fills, "utf8");
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			// What the socket does with an `editor` frame from a tab.
			session.setEditorText("typed");
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			try {
				await session.run({ type: "prompt", text: "/fill" });
			} finally {
				unsubscribe();
			}

			const writes = frames
				.filter((frame) => frame.t === "ui" && frame.request.method === "set_editor_text")
				.map((frame) => (frame.t === "ui" ? frame.request : undefined));
			expect(writes).toEqual([
				{ method: "set_editor_text", text: "read:typed", mode: "replace" },
				{ method: "set_editor_text", text: "+pasted", mode: "append" },
			]);
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});

/**
 * An extension that shapes the view: pi's working row, the label for thinking pi
 * hides, and the session-wide tool expansion it reads back.
 */
const viewOptions = `
export default function viewOptions(pi) {
	pi.registerCommand("shape", {
		description: "Set every view option, then read one back",
		handler: async (_args, ctx) => {
			ctx.ui.setWorkingMessage("Reading files");
			ctx.ui.setWorkingVisible(false);
			ctx.ui.setHiddenThinkingLabel("Pondering");
			ctx.ui.setToolsExpanded(true);
			ctx.ui.notify(\`expanded:\${ctx.ui.getToolsExpanded()}\`, "info");
		},
	});
}
`;

describe("an extension that shapes the view", () => {
	test("sends each option and reads the expansion it set back", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-view-"));
		const home = agentHome(dir);
		await mkdir(join(dir, "extensions"), { recursive: true });
		await mkdir(home.chatsDir, { recursive: true });
		await writeFile(join(dir, "extensions", "view-options.ts"), viewOptions, "utf8");
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			try {
				await session.run({ type: "prompt", text: "/shape" });
			} finally {
				unsubscribe();
			}

			// The permission extension sets its status on session_start; this command sets
			// the rest.
			const requests = frames.flatMap((frame) =>
				frame.t === "ui" && frame.request.method !== "setStatus" ? [frame.request] : [],
			);
			expect(requests).toEqual([
				{ method: "set_working_message", message: "Reading files" },
				{ method: "set_working_visible", visible: false },
				{ method: "set_hidden_thinking_label", label: "Pondering" },
				{ method: "set_tools_expanded", expanded: true },
				{ method: "notify", message: "expanded:true", notifyType: "info" },
			]);
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});

/**
 * An extension that suggests tags. Its provider answers at a `#` token, returns a
 * duplicate on purpose, and delegates to the base everywhere else, which is how pi's
 * own `addAutocompleteProvider` factories wrap the provider that was there before.
 */
const tagSuggester = `
export default function tagSuggester(pi) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) => ({
			triggerCharacters: ["#"],
			getSuggestions: async (lines, cursorLine, cursorCol) => {
				const line = lines[cursorLine] ?? "";
				if (!line.slice(0, cursorCol).endsWith("#")) {
					return current.getSuggestions(lines, cursorLine, cursorCol, {
						signal: AbortSignal.timeout(100),
					});
				}
				return {
					prefix: "#",
					items: [
						{ value: "#alpha", label: "alpha", description: "the first" },
						{ value: "#alpha", label: "duplicate", description: "dropped" },
					],
				};
			},
			applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol }),
		}));
	});
}
`;

describe("an extension that suggests tokens", () => {
	test("answers the draft with what its provider offered, once per value", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-suggest-"));
		const home = agentHome(dir);
		await mkdir(join(dir, "extensions"), { recursive: true });
		await mkdir(home.chatsDir, { recursive: true });
		await writeFile(join(dir, "extensions", "tag-suggester.ts"), tagSuggester, "utf8");
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			try {
				// A second line, so the cursor's line and column are read from the draft.
				await session.run({ type: "autocomplete", text: "hello\na #", cursor: 9 });
			} finally {
				unsubscribe();
			}

			const result = frames.find(
				(frame) => frame.t === "command-result" && frame.command === "autocomplete",
			);
			if (result?.t !== "command-result") throw new Error("the engine never answered");
			expect(result.ok).toBe(true);
			expect(result.autocomplete).toEqual({
				text: "hello\na #",
				prefix: "#",
				items: [{ value: "#alpha", label: "alpha", description: "the first" }],
			});
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});

/** A provider that throws: a keystroke must not turn into a notice every time. */
const brokenSuggester = `
export default function brokenSuggester(pi) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.addAutocompleteProvider(() => ({
			getSuggestions: async () => {
				throw new Error("bad provider");
			},
			applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol }),
		}));
	});
}
`;

describe("a provider that throws", () => {
	test("leaves the palette empty and reports itself once", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-suggest-bad-"));
		const home = agentHome(dir);
		await mkdir(join(dir, "extensions"), { recursive: true });
		await mkdir(home.chatsDir, { recursive: true });
		await writeFile(join(dir, "extensions", "broken-suggester.ts"), brokenSuggester, "utf8");
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			try {
				await session.run({ type: "autocomplete", text: "a #", cursor: 3 });
				await session.run({ type: "autocomplete", text: "a #b", cursor: 4 });
			} finally {
				unsubscribe();
			}

			const results = frames.filter(
				(frame) => frame.t === "command-result" && frame.command === "autocomplete",
			);
			expect(results).toHaveLength(2);
			for (const result of results) {
				if (result.t !== "command-result") throw new Error("expected a command result");
				expect(result.ok).toBe(true);
				expect(result.autocomplete).toEqual({ text: expect.any(String), prefix: "", items: [] });
			}
			const failures = frames.filter(
				(frame) => frame.t === "error" && frame.message.includes("autocomplete provider"),
			);
			expect(failures).toHaveLength(1);
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});

/**
 * An extension that draws with pi's terminal components. Each call has no browser
 * equivalent, so the host answers with one sentence per method, not one per call:
 * a `session_start` that touches several of them must not flood the transcript.
 */
const terminalOnly = `
export default function terminalOnly(pi) {
	pi.registerCommand("paint-terminal", {
		description: "Use every method a browser cannot draw, twice",
		handler: async (_args, ctx) => {
			ctx.ui.setWidget("card", () => null);
			ctx.ui.setWidget("card", () => null);
			ctx.ui.onTerminalInput(() => undefined);
			ctx.ui.onTerminalInput(() => undefined);
			ctx.ui.setWorkingIndicator({ frames: ["|"] });
			ctx.ui.setWorkingIndicator({ frames: ["-"] });
			ctx.ui.setFooter(() => null);
			ctx.ui.setFooter(() => null);
			ctx.ui.setHeader(() => null);
			ctx.ui.setHeader(() => null);
			await ctx.ui.custom(() => null);
			await ctx.ui.custom(() => null);
			ctx.ui.setEditorComponent(() => null);
			ctx.ui.setEditorComponent(() => null);
		},
	});
}
`;

describe("an extension that draws terminal components", () => {
	test("names each TUI-only method once, however often it is called", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-terminal-only-"));
		const home = agentHome(dir);
		await mkdir(join(dir, "extensions"), { recursive: true });
		await mkdir(home.chatsDir, { recursive: true });
		await writeFile(join(dir, "extensions", "terminal-only.ts"), terminalOnly, "utf8");
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			try {
				await session.run({ type: "prompt", text: "/paint-terminal" });
			} finally {
				unsubscribe();
			}

			const notices = frames.flatMap((frame) =>
				frame.t === "ui" &&
				frame.request.method === "notify" &&
				frame.request.message.startsWith("An extension used")
					? [frame.request.message]
					: [],
			);
			expect(notices).toEqual([
				"An extension used setWidget, which needs the terminal tab.",
				"An extension used onTerminalInput, which needs the terminal tab.",
				"An extension used setWorkingIndicator, which needs the terminal tab.",
				"An extension used setFooter, which needs the terminal tab.",
				"An extension used setHeader, which needs the terminal tab.",
				"An extension used custom, which needs the terminal tab.",
				"An extension used setEditorComponent, which needs the terminal tab.",
			]);
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
