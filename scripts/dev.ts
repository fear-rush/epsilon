import { copyFileSync, existsSync, lstatSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createServer } from "vite";

import { linkSandbox, sandboxRoot } from "./sandbox";

/**
 * The dev loop: Vite for the page, `bun --watch` for the server.
 *
 * Both processes get the same launch token and port, so the page Vite serves can open the
 * socket the server holds; the server also gets a sandboxed `HOME` unless `--host` asks
 * for the operator's own home (README, Sandbox).
 */

const repoRoot = resolve(import.meta.dirname, "..");
const serverPort = 3000;
const devPort = 5173;
const devOrigins = `http://localhost:${devPort},http://127.0.0.1:${devPort}`;
const launchToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");

/** Files Settings can write, so the sandbox owns copies rather than links. */
const copied = ["auth.json", "models.json"];

const useHost = process.argv.includes("--host");

const prepareSandbox = (): Readonly<Record<string, string>> => {
	const agentHome = join(sandboxRoot, "agent");
	const home = join(sandboxRoot, "home");
	linkSandbox();
	mkdirSync(agentHome, { recursive: true });
	mkdirSync(home, { recursive: true });

	const hostAgentHome = join(homedir(), ".pi", "agent");
	for (const name of copied) {
		const source = join(hostAgentHome, name);
		const target = join(agentHome, name);
		if (!existsSync(source)) continue;
		// An older sandbox linked this file; replace the link so a write cannot reach the
		// operator's home.
		if (existsSync(target) && lstatSync(target).isSymbolicLink()) unlinkSync(target);
		if (existsSync(target)) continue;
		copyFileSync(source, target);
		console.log(`dev: copied ${source} -> ${target}`);
	}

	// The sandbox's own `~`: a fresh machine, so pi loads none of the operator's
	// `~/.agents`, `~/.claude` or `~/.codex`, and Projects may only open folders inside it.
	return {
		EPSILON_AGENT_HOME: agentHome,
		EPSILON_PROJECTS_ROOT: home,
		HOME: home,
	};
};

const environment: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
	if (value !== undefined) environment[key] = value;
}
// An inherited home must not decide which configuration Epsilon runs on.
delete environment["PI_CODING_AGENT_DIR"];
delete environment["PI_CODING_AGENT_SESSION_DIR"];
delete environment["PI_PACKAGE_DIR"];

Object.assign(environment, useHost ? {} : prepareSandbox(), {
	EPSILON_DEV_ORIGIN: devOrigins,
	EPSILON_PORT: String(serverPort),
	EPSILON_TOKEN: launchToken,
});
// Vite runs in this process, so its `index.html` transform reads the same token the
// server child gets.
process.env["EPSILON_TOKEN"] = launchToken;

const server = Bun.spawn({
	cmd: [process.execPath, "--watch", "src/backend/main.ts"],
	cwd: repoRoot,
	env: environment,
	stdio: ["inherit", "inherit", "inherit"],
});

const vite = await createServer({
	server: { host: "127.0.0.1", port: devPort, strictPort: true },
});
await vite.listen();

console.log(`dev: page http://127.0.0.1:${devPort}, server http://127.0.0.1:${serverPort}`);
console.log(useHost ? "dev: the operator's own home" : `dev: sandbox ${sandboxRoot}`);

let stopping = false;
const stop = (signal: NodeJS.Signals): void => {
	if (stopping) return;
	stopping = true;
	void vite.close();
	server.kill(signal);
	// A child that ignores shutdown must not hold the terminal; the second signal or the
	// deadline ends it (F8i).
	setTimeout(() => server.kill("SIGKILL"), 5000);
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGHUP", () => stop("SIGHUP"));

process.exit(await server.exited);
