import { afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, relative, resolve } from "node:path";

/**
 * The test preload. It runs before any test file, gives the whole process a scratch
 * `HOME` and agent home, and refuses to start if either lands inside the operator's real
 * home. A test that reads `~/.pi` would otherwise parse every real session on every run.
 */

const realHome = resolve(userInfo().homedir);
const scratch = mkdtempSync(join(tmpdir(), "epsilon-test-"));
const agentHome = join(scratch, "agent");
const sandboxHome = join(scratch, "home");

/** Fails when `path` resolves under the operator's home, or is the filesystem root. */
export function assertNotRealHome(path: string): void {
	const resolved = resolve(path);
	if (realHome === "/" || realHome.length <= 1) {
		throw new Error(`refusing to run tests: cannot resolve a real home (got "${realHome}")`);
	}
	const inside = relative(realHome, resolved);
	if (inside === "" || (!inside.startsWith("..") && !inside.startsWith("/"))) {
		throw new Error(`refusing to run tests inside the real home: ${resolved}`);
	}
}

for (const path of [scratch, agentHome, sandboxHome]) assertNotRealHome(path);

mkdirSync(agentHome, { recursive: true });
mkdirSync(sandboxHome, { recursive: true });

// A run inside the operator's own pi session must not inherit its CLI context: the
// package path decides where pi's own assets live (its HTML export template, for one),
// and the session variables name another chat. `bun run dev` drops the same list.
delete process.env["PI_PACKAGE_DIR"];
delete process.env["PI_SESSION_FILE"];
delete process.env["PI_SESSION_ID"];
delete process.env["PI_CODING_AGENT"];
delete process.env["PI_CODING_AGENT_SESSION_DIR"];

process.env["HOME"] = sandboxHome;
process.env["PI_CODING_AGENT_DIR"] = agentHome;
process.env["EPSILON_AGENT_HOME"] = agentHome;

/** Where this test process may write. Tests build sessions and homes below `scratch`. */
export const testPaths = {
	scratch,
	agentHome,
	sandboxHome,
	realHome,
} as const;

const suiteBudgetMs = 120_000;
setTimeout(() => {
	process.stderr.write(`test suite exceeded ${suiteBudgetMs / 1000} s budget\n`);
	process.exit(124);
}, suiteBudgetMs).unref();

/** Child processes still alive after a suite mean a test leaked one. */
function orphans(): string[] {
	const listing = Bun.spawnSync(["ps", "-o", "pid=,command="], { stdout: "pipe" });
	return listing.stdout
		.toString()
		.split("\n")
		.filter((line) => line.trim() !== "")
		.filter((line) => {
			const pid = Number.parseInt(line.trim().split(/\s+/)[0] ?? "", 10);
			if (!Number.isInteger(pid) || pid === process.pid) return false;
			const parent = Bun.spawnSync(["ps", "-o", "ppid=", "-p", String(pid)], { stdout: "pipe" });
			return parent.stdout.toString().trim() === String(process.pid);
		});
}

afterAll(() => {
	const leaked = orphans();
	rmSync(scratch, { recursive: true, force: true });
	if (leaked.length > 0) {
		throw new Error(`tests left child processes running:\n${leaked.join("\n")}`);
	}
});
