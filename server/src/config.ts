/**
 * Ports, paths and the one project this server drives. The only module that
 * reads `process.env` (docs/architecture.md).
 */
import { resolve } from "node:path";

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
} as const;
