import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

import { until } from "../until.ts";

/**
 * Starts a real epsilon server on a scratch home and returns its origin.
 *
 * `node:child_process` rather than `Bun.spawn`, because Playwright's workers run under
 * Node. The server itself is built in step 7; until then every spec that launches it
 * fails with the spawn error, which is the expected state of a spec written first.
 */

export type RunningApp = {
	readonly url: string;
	readonly home: string;
	stop(): void;
};

export type LaunchOptions = {
	readonly home: string;
	readonly port?: number;
};

const stopChild = (child: ChildProcess): void => {
	if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
};

export async function launchEpsilon({ home, port = 4789 }: LaunchOptions): Promise<RunningApp> {
	const child = spawn("bun", ["run", "src/backend/main.ts"], {
		cwd: new URL("../..", import.meta.url).pathname,
		env: {
			...process.env,
			EPSILON_AGENT_HOME: home,
			EPSILON_PORT: String(port),
			PI_CODING_AGENT_DIR: home,
		},
		stdio: "inherit",
	});
	const url = `http://127.0.0.1:${port}`;
	try {
		await until(
			async () => {
				try {
					const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(200) });
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
	return { home, stop: () => stopChild(child), url };
}
