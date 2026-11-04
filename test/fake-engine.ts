import { until } from "./until.ts";

/**
 * A running fake engine for supervisor tests. It is a real child process using Bun IPC,
 * not an in-memory stand-in: crash, hang and orphan behaviour are what those tests are
 * about.
 */

export type FakeMode = "normal" | "silent" | "crash" | "ignore-shutdown";

export type FakeEngine = {
	readonly pid: number;
	readonly exited: Promise<number>;
	send(message: unknown): void;
	waitFor(type: string, deadline?: number): Promise<Record<string, unknown>>;
	messages(): ReadonlyArray<Record<string, unknown>>;
	stop(): void;
};

const fixture = new URL("./fixtures/fake-engine-child.ts", import.meta.url).pathname;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function startFakeEngine(mode: FakeMode = "normal"): FakeEngine {
	const received: Record<string, unknown>[] = [];
	const child = Bun.spawn([process.execPath, "run", fixture], {
		env: {
			FAKE_ENGINE_MODE: mode,
			HOME: process.env["HOME"] ?? "/tmp",
			PATH: process.env["PATH"] ?? "",
			PI_CODING_AGENT_DIR: process.env["PI_CODING_AGENT_DIR"] ?? "/tmp",
		},
		ipc: (message: unknown) => {
			if (isRecord(message)) received.push(message);
		},
		stderr: "pipe",
		stdout: "pipe",
	});

	return {
		exited: child.exited,
		messages: () => received,
		pid: child.pid,
		send: (message) => child.send(message),
		stop: () => child.kill(),
		waitFor: async (type, deadline = 2000) => {
			await until(() => received.some((message) => message["t"] === type), {
				deadline,
				what: `fake engine message "${type}"`,
			});
			const match = received.find((message) => message["t"] === type);
			if (match === undefined) throw new Error(`no "${type}" message`);
			return match;
		},
	};
}

/** The spawn spec the supervisor needs to run this fake, as a real engine would run. */
export const fakeSpec = (mode: FakeMode = "normal") => ({
	command: [process.execPath, "run", fixture],
	env: {
		FAKE_ENGINE_MODE: mode,
		HOME: process.env["HOME"] ?? "/tmp",
		PATH: process.env["PATH"] ?? "",
		PI_CODING_AGENT_DIR: process.env["PI_CODING_AGENT_DIR"] ?? "/tmp",
	},
});
