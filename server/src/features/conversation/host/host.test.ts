/**
 * The session host against a real engine: pi builds the session, loads an
 * extension from the agent home, and the extension drives the session controls.
 *
 * This is what a bare `AgentSession` could not do: `dispose()` emitted no
 * `session_shutdown`, and `bindExtensions` without `commandContextActions`
 * installed stubs that answered success and changed nothing.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../../platform/agent-home";
import type { UiHost } from "../ui-context";
import { bindHost } from "./bindings";
import { SessionHost } from "./host";

/** A host with no tab behind it: a question is refused, displays are dropped. */
const NO_TAB: UiHost = {
	ask: async (question) => ({ id: question.id, method: "cancel" }),
	display: () => undefined,
	editorText: () => "",
	toolsExpanded: () => false,
	setToolsExpanded: () => undefined,
	addAutocompleteProvider: () => undefined,
	unsupported: () => undefined,
	fail: (error) => {
		throw error;
	},
	notice: () => undefined,
};

/**
 * An operator extension that writes what pi told it, so the test reads pi's own
 * event stream rather than a fake.
 */
const recorder = (log: string): string => `
import { appendFileSync } from "node:fs";

export default function recorder(pi) {
	const record = (line) => appendFileSync(${JSON.stringify(log)}, line + "\\n");
	pi.on("session_start", (event) => record("start " + event.reason));
	pi.on("session_shutdown", (event) => record("shutdown " + event.reason));
	pi.registerCommand("next", {
		description: "Replace this session",
		handler: async (_args, ctx) => {
			await ctx.newSession();
		},
	});
	pi.registerCommand("reread", {
		description: "Re-read resources without replacing the session",
		handler: async (_args, ctx) => {
			await ctx.reload();
		},
	});
}
`;

const scratch = async () => {
	const dir = await mkdtemp(join(tmpdir(), "epsilon-host-"));
	const home = agentHome(dir);
	await mkdir(join(dir, "extensions"), { recursive: true });
	await mkdir(home.chatsDir, { recursive: true });
	return { dir, home };
};

const lines = async (log: string): Promise<string[]> =>
	(await readFile(log, "utf8")).trim().split("\n");

describe("session host", () => {
	test("an extension command replaces the session and pi rebinds it", async () => {
		const { dir, home } = await scratch();
		const log = join(dir, "events.log");
		await writeFile(join(dir, "extensions", "recorder.ts"), recorder(log), "utf8");
		const host = await SessionHost.open({
			home,
			cwd: home.chatsDir,
			sessionId: crypto.randomUUID(),
			file: undefined,
			chat: true,
		});
		const replaced: { from: string; to: string; reason: string }[] = [];
		host.onReplaced((replacement) => replaced.push(replacement));
		try {
			await bindHost(host, NO_TAB);
			const first = host.id;
			expect(await lines(log)).toEqual(["start startup"]);

			// What a socket prompt does: pi dispatches the extension command itself.
			await host.session.prompt("/next");

			expect(host.id).not.toBe(first);
			expect(replaced).toEqual([{ from: first, to: host.id, reason: "new" }]);
			// pi tore the old session down before applying the new one, and the new
			// session was bound again through `setRebindSession`.
			expect(await lines(log)).toEqual(["start startup", "shutdown new", "start new"]);
		} finally {
			await host.close();
		}
		// The runtime's dispose is the teardown that emits `session_shutdown`; a
		// plain `session.dispose()` would have left the home's MCP transports open.
		expect((await lines(log)).at(-1)).toBe("shutdown quit");
		await rm(dir, { recursive: true, force: true });
	});

	test("an extension can re-read resources without replacing the session", async () => {
		const { dir, home } = await scratch();
		const log = join(dir, "events.log");
		await writeFile(join(dir, "extensions", "recorder.ts"), recorder(log), "utf8");
		const host = await SessionHost.open({
			home,
			cwd: home.chatsDir,
			sessionId: crypto.randomUUID(),
			file: undefined,
			chat: true,
		});
		try {
			await bindHost(host, NO_TAB);
			const id = host.id;
			await host.session.prompt("/reread");
			// pi tears the extension runners down and starts them again inside
			// `reload()`; the unbound stub did nothing at all.
			expect(await lines(log)).toEqual(["start startup", "shutdown reload", "start reload"]);
			expect(host.id).toBe(id);
		} finally {
			await host.close();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
