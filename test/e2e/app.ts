import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { until } from "../until.ts";

/**
 * Starts a real epsilon server on a scratch home and returns its origin.
 *
 * `node:child_process` rather than `Bun.spawn`, because Playwright's workers run under
 * Node. The spec suite runs `bun run build` first, so this is the same bundle `bun run
 * start` serves. The launch token is chosen here, so a stopped server can come back with
 * the page it already served still valid.
 */

export type RunningApp = {
	readonly url: string;
	readonly home: string;
	readonly token: string;
	stop(): void;
	/** Stops the process and starts a new one on the same home, port and token. */
	restart(): Promise<void>;
};

export type LaunchOptions = {
	readonly home: string;
	readonly port?: number;
	readonly token?: string;
	/** The folder the picker may open, as the dev sandbox bounds it. */
	readonly projectsRoot?: string;
};

const stopChild = (child: ChildProcess): void => {
	if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
};

export async function launchEpsilon({
	home,
	port = 4789,
	projectsRoot,
	token = crypto.randomUUID(),
}: LaunchOptions): Promise<RunningApp> {
	const url = `http://127.0.0.1:${port}`;

	// A sandboxed `~`, as `bun run dev` gives its server: a spec never reads the
	// developer's own `~/.agents`, packages or skills.
	const userHome = mkdtempSync(join(tmpdir(), "epsilon-e2e-home-"));
	const env: NodeJS.ProcessEnv = {
		...process.env,
		HOME: userHome,
		EPSILON_AGENT_HOME: home,
		EPSILON_PORT: String(port),
		EPSILON_TOKEN: token,
		PI_CODING_AGENT_DIR: home,
	};
	if (projectsRoot !== undefined) env["EPSILON_PROJECTS_ROOT"] = projectsRoot;

	const spawnServer = (): ChildProcess =>
		spawn("bun", ["dist/backend/main.js"], {
			cwd: new URL("../..", import.meta.url).pathname,
			env,
			stdio: "inherit",
		});

	const healthy = async (child: ChildProcess): Promise<void> => {
		try {
			await until(
				async () => {
					try {
						const response = await fetch(`${url}/api/health`, {
							signal: AbortSignal.timeout(200),
						});
						return response.ok;
					} catch {
						return false;
					}
				},
				{ what: "epsilon to answer on its port", deadline: 8000 },
			);
		} catch (cause) {
			stopChild(child);
			throw cause;
		}
	};

	let child = spawnServer();
	await healthy(child);

	return {
		home,
		restart: async () => {
			stopChild(child);
			await until(() => child.exitCode !== null || child.signalCode !== null, {
				what: "the server to exit",
				deadline: 8000,
			});
			child = spawnServer();
			await healthy(child);
		},
		stop: () => stopChild(child),
		token,
		url,
	};
}
