/**
 * The dev loop's own agent home, so `bun run dev` never writes into the operator's
 * real `~/.pi`. Nothing here changes a deployment: a container sets
 * `EPSILON_AGENT_HOME` to the volume, and an unset variable still means pi's default
 * path inside that deployment (ADR-0005).
 *
 * pi creates the home's layout itself on first use (`sessions/`, `auth.json`,
 * `models-store.json`), so this script creates no pi file it could get wrong. The one
 * concession is a pair of symlinks: a fresh sandbox has no credential, and a dev loop
 * that cannot run a turn is not a dev loop. They point at the operator's files and
 * copy nothing; delete them to test the unconfigured state.
 */
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const sandbox = join(repoRoot, ".sandbox");
const agentHome = join(sandbox, "agent");
const projectDir = join(sandbox, "project");

/** Files read through from the operator's home: credentials and the model catalog. */
const LINKED = ["auth.json", "models.json"];

const hostAgentHome = join(homedir(), ".pi", "agent");

const useHost = process.argv.includes("--host");
/** Anything else goes to turbo, so `--filter=server` works through this script too. */
const passthrough = process.argv.slice(2).filter((argument) => argument !== "--host");

const linkSandboxCredential = (): void => {
	for (const name of LINKED) {
		const target = join(hostAgentHome, name);
		const link = join(agentHome, name);
		if (existsSync(link) || !existsSync(target)) continue;
		symlinkSync(target, link);
		console.log(`dev: linked ${link} -> ${target}`);
	}
};

const environment = { ...process.env };

if (useHost) {
	// The real home, on purpose: reading sessions the terminal created.
	delete environment.EPSILON_AGENT_HOME;
	delete environment.EPSILON_PROJECT;
	console.log("dev: host home, the operator's own pi configuration");
} else {
	mkdirSync(agentHome, { recursive: true });
	mkdirSync(projectDir, { recursive: true });
	linkSandboxCredential();
	environment.EPSILON_AGENT_HOME = agentHome;
	environment.EPSILON_PROJECT = projectDir;
	// An inherited value must not decide which config a deployment runs on
	// (AGENTS.md rule 9). The sandbox clears what it cannot pass explicitly.
	delete environment.PI_PACKAGE_DIR;
	delete environment.PI_CODING_AGENT_SESSION_DIR;
	console.log(`dev: sandbox home ${agentHome}`);
	console.log(`dev: sandbox project ${projectDir}`);
}

const turbo = join(repoRoot, "node_modules", ".bin", "turbo");
const child = Bun.spawn({
	cmd: [turbo, "dev", ...passthrough],
	env: environment,
	stdio: ["inherit", "inherit", "inherit"],
});

const stop = (signal: NodeJS.Signals): void => {
	child.kill(signal);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

process.exit(await child.exited);
