import { until } from "./until.ts";

/**
 * A running fake engine for supervisor tests. It is a real child process using Bun IPC,
 * not an in-memory stand-in: crash, hang and orphan behaviour are what those tests are
 * about.
 */

export type FakeEngine = {
	readonly pid: number;
	readonly exited: Promise<number>;
	send(message: unknown): void;
	waitFor(type: string, deadline?: number): Promise<Record<string, unknown>>;
	messages(): ReadonlyArray<Record<string, unknown>>;
	stop(): void;
};

const fixture = new URL("./fixtures/fake-engine.ts", import.meta.url).pathname;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function startFakeEngine(): FakeEngine {
	const received: Record<string, unknown>[] = [];
	const child = Bun.spawn(["bun", "run", fixture], {
		ipc: (message: unknown) => {
			if (isRecord(message)) received.push(message);
		},
		stderr: "pipe",
		stdout: "pipe",
	});

	return {
		pid: child.pid,
		exited: child.exited,
		send: (message) => child.send(message),
		waitFor: async (type, deadline = 2000) => {
			await until(() => received.some((message) => message["type"] === type), {
				what: `fake engine message "${type}"`,
				deadline,
			});
			const match = received.find((message) => message["type"] === type);
			if (match === undefined) throw new Error(`no "${type}" message`);
			return match;
		},
		messages: () => received,
		stop: () => child.kill(),
	};
}
