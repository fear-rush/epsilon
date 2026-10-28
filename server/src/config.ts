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

/**
 * The agent home: pi's settings, credentials, extensions, packages and sessions.
 * Chosen here, from our own variable or pi's default, never from an inherited
 * `PI_CODING_AGENT_DIR` (AGENTS.md rule 9).
 */
const agentHome = resolve(process.env.EPSILON_AGENT_HOME ?? join(homedir(), ".pi", "agent"));

/**
 * pi resolves its own paths — including the session list this server reads — from
 * its config directory at call time. Publishing the choice here is what keeps
 * those reads on the same home the engine is given; without it the list would
 * come from one home and the turns would write to another.
 */
process.env.PI_CODING_AGENT_DIR = agentHome;

export const config = {
	host: "127.0.0.1",
	port: Number(process.env.PORT ?? 3000),
	socketPath: "/api/link",
	/** Where the agent runs, and therefore which pi sessions belong to this page. */
	projectDir: resolve(process.env.EPSILON_PROJECT ?? repoRoot),
	/** The home every engine gets, passed explicitly by `agent/engine.ts`. */
	agentHome,
} as const;
