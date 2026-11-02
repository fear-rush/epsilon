/**
 * A label written from the dashboard is pi's own `label` entry, so the tree shows it
 * and a terminal reads it. The tree filter is pi's `treeFilterMode` setting, written
 * through its own setter rather than kept in the browser.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerFrame, SnapshotTreeNode } from "shared";

import { agentHome } from "../../platform/agent-home";
import { openSessionManager } from "./host/factory";
import { SessionRegistry } from "./registry";
import type { LiveSession } from "./session";

const scratch = async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "epsilon-labels-")));
	const home = agentHome(join(root, "home"));
	await mkdir(home.chatsDir, { recursive: true });
	// A flat store so the test does not depend on pi's process-wide agent dir.
	const store = join(root, "sessions");
	await writeFile(join(home.dir, "settings.json"), JSON.stringify({ sessionDir: store }));
	const id = crypto.randomUUID();
	const manager = openSessionManager(home.chatsDir, id, undefined, home);
	const entryId = manager.appendMessage({ role: "user", content: "hello", timestamp: Date.now() });
	const file = manager.getSessionFile();
	if (file === undefined) throw new Error("pi created no session file");
	return { root, home, id, entryId, file };
};

/** The snapshot a fresh subscriber receives; subscribe sends it synchronously. */
const snapshotAfter = (session: LiveSession) => {
	const frames: ServerFrame[] = [];
	session.subscribe((frame) => frames.push(frame))();
	const snapshot = frames.find((frame) => frame.t === "snapshot");
	if (snapshot?.t !== "snapshot") throw new Error("the session sent no snapshot");
	return snapshot.snapshot;
};

const findNode = (nodes: SnapshotTreeNode[], entryId: string): SnapshotTreeNode | undefined => {
	for (const node of nodes) {
		if (node.entryId === entryId) return node;
		const found = findNode(node.children, entryId);
		if (found !== undefined) return found;
	}
	return undefined;
};

describe("labelling an entry", () => {
	test("writes pi's label entry, shows it in the tree, and clears it again", async () => {
		const { root, home, id, entryId, file } = await scratch();
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(id, { kind: "chat" });
			await session.run({ type: "set_label", entryId, label: "Important" });

			expect(findNode(snapshotAfter(session).state.tree, entryId)?.label).toBe("Important");
			const entries: { type?: string; targetId?: string; label?: string }[] = (
				await readFile(file, "utf8")
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			expect(entries).toContainEqual(
				expect.objectContaining({ type: "label", targetId: entryId, label: "Important" }),
			);

			await session.run({ type: "set_label", entryId });
			expect(findNode(snapshotAfter(session).state.tree, entryId)?.label).toBeUndefined();
		} finally {
			await registry.disposeAll();
			await rm(root, { recursive: true, force: true });
		}
	});

	test("the tree filter is pi's treeFilterMode setting", async () => {
		const { root, home, id } = await scratch();
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(id, { kind: "chat" });
			await session.run({ type: "set_tree_filter_mode", mode: "labeled-only" });

			expect(snapshotAfter(session).state.treeFilterMode).toBe("labeled-only");
			const settings = JSON.parse(await readFile(join(home.dir, "settings.json"), "utf8"));
			expect(settings).toMatchObject({ treeFilterMode: "labeled-only" });
		} finally {
			await registry.disposeAll();
			await rm(root, { recursive: true, force: true });
		}
	});
});
