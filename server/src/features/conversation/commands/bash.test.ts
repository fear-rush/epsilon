/**
 * `!cmd` from the web, against a real engine and a real extension. pi's TUI emits
 * `user_bash` before it runs a shell command and `AgentSession.executeBash` does
 * not, so what is checked here is that the host does it and honours both answers:
 * a replacement result, and the chunks pi streams while a command runs.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ServerFrame } from "shared";
import { emptyConversation, reduce, transcript } from "shared";

import { agentHome } from "../../../platform/agent-home";
import type { AgentHome } from "../../../platform/agent-home";
import { SessionRegistry } from "../registry";

/** An extension that refuses one shell command, the way a guard would. */
const blocker = `
export default function blocker(pi) {
	pi.on("user_bash", (event) => {
		if (!event.command.includes("rm -rf")) return undefined;
		return {
			result: {
				output: "Blocked by the test extension.",
				exitCode: 126,
				cancelled: false,
				truncated: false,
			},
		};
	});
}
`;

const scratch = async (): Promise<{ dir: string; home: AgentHome }> => {
	const dir = await mkdtemp(join(tmpdir(), "epsilon-bash-"));
	const home = agentHome(dir);
	await mkdir(join(dir, "extensions"), { recursive: true });
	await mkdir(home.chatsDir, { recursive: true });
	await writeFile(join(dir, "extensions", "blocker.ts"), blocker, "utf8");
	return { dir, home };
};

const lastSnapshot = (frames: ServerFrame[]): Extract<ServerFrame, { t: "snapshot" }> => {
	const frame = frames.filter((candidate) => candidate.t === "snapshot").at(-1);
	if (frame?.t !== "snapshot") throw new Error("expected a snapshot frame");
	return frame;
};

describe("a shell command from the web", () => {
	test("an extension's user_bash result replaces the command", async () => {
		const { dir, home } = await scratch();
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			try {
				await session.run({ type: "bash", command: "rm -rf build", excludeFromContext: false });
			} finally {
				unsubscribe();
			}

			const state = reduce(emptyConversation, lastSnapshot(frames));
			const row = transcript(state).find((candidate) => candidate.kind === "tool");
			if (row?.kind !== "tool") throw new Error("expected a bash row");
			expect(row.run.output).toBe("Blocked by the test extension.");
			expect(row.run.status).toBe("error");
			expect(row.run.note).toBe("(exit 126)");
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("the output streams to the row while the command runs", async () => {
		const { dir, home } = await scratch();
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			try {
				await session.run({
					type: "bash",
					command: "printf first; sleep 0.05; printf second",
					excludeFromContext: false,
				});
			} finally {
				unsubscribe();
			}

			const state = frames
				.filter((frame) => frame.t === "event")
				.reduce((current, frame) => reduce(current, frame), emptyConversation);
			expect(state.bash?.output).toBe("firstsecond");
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
