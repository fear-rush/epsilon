/**
 * Ports, paths and the one project this server drives. The only module that
 * reads `process.env` (docs/architecture.md).
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * `server/src` in a source run and `server/dist` after a build, so the repo root
 * is two levels up either way. Not `process.cwd()`: `turbo dev` starts this task
 * inside `server/`, and pi reads that as the project, which hides every session
 * the terminal created at the root.
 */
const repoRoot = resolve(import.meta.dirname, "../..");

export const config = {
	host: "127.0.0.1",
	port: Number(process.env.PORT ?? 3000),
	socketPath: "/api/link",
	/** Where the agent runs, and therefore which pi sessions belong to this page. */
	projectDir: resolve(process.env.EPSILON_PROJECT ?? repoRoot),
	/**
	 * The agent home: pi's settings, credentials, extensions, packages and sessions.
	 * Chosen here and passed to every child, so an inherited `PI_CODING_AGENT_DIR`
	 * cannot decide which config this deployment runs on (AGENTS.md rule 9). The
	 * default is pi's own, which keeps a source run on the operator's home until a
	 * deployment names a volume (ADR-0005, deploy.md).
	 */
	agentHome: resolve(process.env.EPSILON_AGENT_HOME ?? join(homedir(), ".pi", "agent")),
} as const;
