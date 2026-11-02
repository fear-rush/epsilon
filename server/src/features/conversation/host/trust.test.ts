/**
 * The trust chain as a live engine runs it: a gated project starts untrusted, pi's
 * bootstrap pass loads the home's extensions, `project_trust` decides, and the
 * folder's own extensions load only if that answer is yes. A handler that throws is
 * a notice, not a failed engine.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerFrame } from "shared";

import { agentHome } from "../../../platform/agent-home";
import { projectTrustStore } from "../../../platform/pi";
import { SessionRegistry } from "../registry";

/** A project extension that records its own load, so trust is observable. */
const loaded = (log: string): string => `
import { appendFileSync } from "node:fs";

export default function loaded() {
	appendFileSync(${JSON.stringify(log)}, "project-extension-loaded\\n");
}
`;

/** A home extension that answers pi's trust question, optionally throwing. */
const policy = (log: string, answer: string): string => `
import { appendFileSync } from "node:fs";

export default function policy(pi) {
	pi.on("project_trust", (event) => {
		appendFileSync(${JSON.stringify(log)}, "asked " + event.cwd + "\\n");
		${answer}
	});
}
`;

const scratch = async () => {
	const dir = await mkdtemp(join(tmpdir(), "epsilon-trust-engine-"));
	const root = await realpath(dir);
	const home = agentHome(join(root, "home"));
	await mkdir(join(home.dir, "extensions"), { recursive: true });
	const project = join(root, "project");
	await mkdir(join(project, ".pi", "extensions"), { recursive: true });
	const log = join(root, "events.log");
	await writeFile(join(project, ".pi", "extensions", "loaded.ts"), loaded(log), "utf8");
	// The page trusts the folder; a `project_trust` handler runs before that record.
	projectTrustStore(home).set(project, true);
	return { dir, home, project, log };
};

const events = async (log: string): Promise<string[]> =>
	(await readFile(log, "utf8").catch(() => "")).split("\n").filter((line) => line !== "");

describe("project trust in a live engine", () => {
	test("an extension's no keeps the folder's own extensions out", async () => {
		const { dir, home, project, log } = await scratch();
		await writeFile(
			join(home.dir, "extensions", "denier.ts"),
			policy(log, 'return { trusted: "no" };'),
			"utf8",
		);
		const registry = new SessionRegistry(home);
		try {
			await registry.ensure(crypto.randomUUID(), { kind: "project", path: project });
			const seen = await events(log);
			expect(seen).toContain(`asked ${project}`);
			expect(seen).not.toContain("project-extension-loaded");
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("a handler that throws is reported and the saved decision still decides", async () => {
		const { dir, home, project, log } = await scratch();
		await writeFile(
			join(home.dir, "extensions", "broken.ts"),
			policy(log, 'throw new Error("boom");'),
			"utf8",
		);
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), {
				kind: "project",
				path: project,
			});
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			unsubscribe();

			const notices = frames.filter((frame) => frame.t === "notice" && frame.kind === "extension");
			expect(notices).toHaveLength(1);
			expect(notices[0]).toMatchObject({
				text: `Extension "${join(home.dir, "extensions", "broken.ts")}" project_trust error: boom`,
			});
			expect(await events(log)).toContain("project-extension-loaded");
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
