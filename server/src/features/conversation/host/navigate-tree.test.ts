/**
 * pi's `ctx.navigateTree` through the binding the host installs, on a real session
 * file: an extension command moves the leaf, and the snapshot a tab draws follows
 * it. Without `commandContextActions` pi installs a stub that answers success and
 * leaves the session where it was.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerFrame, SnapshotTreeNode } from "shared";

import { agentHome } from "../../../platform/agent-home";
import { SessionRegistry } from "../registry";
import type { LiveSession } from "../session";
import { openSessionManager } from "./factory";

/** An operator extension that moves the leaf where its argument names. */
const navigator = `
export default function navigator(pi) {
	pi.registerCommand("go", {
		description: "Move the leaf before an entry of this session",
		handler: async (args, ctx) => {
			await ctx.navigateTree(args.trim());
		},
	});
}
`;

/** The snapshot a fresh subscriber receives; subscribe sends it synchronously. */
const snapshotAfter = (session: LiveSession) => {
	const frames: ServerFrame[] = [];
	session.subscribe((frame) => frames.push(frame))();
	const snapshot = frames.find((frame) => frame.t === "snapshot");
	if (snapshot?.t !== "snapshot") throw new Error("the session sent no snapshot");
	return snapshot.snapshot;
};

const flatten = (nodes: SnapshotTreeNode[]): SnapshotTreeNode[] =>
	nodes.flatMap((node) => [node, ...flatten(node.children)]);

describe("navigating the session tree from an extension", () => {
	test("moves the leaf and the transcript to where the command pointed", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-navigate-"));
		const home = agentHome(dir);
		await mkdir(join(dir, "extensions"), { recursive: true });
		await mkdir(home.chatsDir, { recursive: true });
		await writeFile(join(dir, "extensions", "navigator.ts"), navigator, "utf8");
		// A flat store, so the test does not depend on pi's process-wide agent dir.
		await writeFile(
			join(home.dir, "settings.json"),
			JSON.stringify({ sessionDir: join(dir, "sessions") }),
		);
		const id = crypto.randomUUID();
		const manager = openSessionManager(home.chatsDir, id, undefined, home);
		const first = manager.appendMessage({ role: "user", content: "one", timestamp: Date.now() });
		const second = manager.appendMessage({ role: "user", content: "two", timestamp: Date.now() });
		manager.appendMessage({ role: "user", content: "three", timestamp: Date.now() });

		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(id, { kind: "chat" });
			await session.run({ type: "prompt", text: `/go ${second}` });

			const snapshot = snapshotAfter(session);
			const nodes = flatten(snapshot.state.tree);
			expect(nodes.filter((node) => node.current).map((node) => node.entryId)).toEqual([first]);
			expect(nodes.find((node) => node.entryId === second)?.current).toBe(false);
			expect(
				snapshot.messages.flatMap((message) => (message.role === "user" ? [message.content] : [])),
			).toEqual(["one"]);
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	}, 20_000);
});
