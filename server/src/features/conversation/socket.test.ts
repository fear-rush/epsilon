/**
 * The socket shares one engine between tabs, so a tab that gives up on a session
 * it was waiting for must not tear that session down. These checks drive the real
 * frame handler against a registry whose `ensure` the test releases by hand.
 */
import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION } from "shared";
import type { ClientFrame } from "shared";

import { handleMessage } from "./socket";
import type { ChatSocket, ChatState, Engines, Watchable } from "./socket";

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

const tab = (): ChatSocket & { sent: string[] } => {
	const data: ChatState = {
		tabId: "t",
		welcomed: false,
		closed: false,
		wanted: new Set(),
		unsubscribes: new Map(),
		attaching: new Map(),
	};
	const sent: string[] = [];
	return { data, sent, send: (message) => sent.push(String(message)) };
};

const fakeSession = () => {
	const calls = { subscribed: 0, released: 0 };
	const session: Watchable = {
		isOpen: true,
		subscribe: () => {
			calls.subscribed += 1;
			return () => undefined;
		},
		release: () => {
			calls.released += 1;
		},
		run: async () => undefined,
		answerDialog: () => "answered",
	};
	return { session, calls };
};

const send = (engines: Engines, socket: ChatSocket, frame: ClientFrame): void =>
	handleMessage(engines, socket, JSON.stringify(frame));

describe("attaching while the engine is being built", () => {
	test("a tab that detached before the build finished releases the shared session", async () => {
		const { session, calls } = fakeSession();
		let finish: (value: Watchable) => void = () => undefined;
		const engines: Engines = {
			ensure: () => new Promise((resolve) => (finish = resolve)),
			find: () => undefined,
		};
		const socket = tab();
		send(engines, socket, { t: "hello", protocol: PROTOCOL_VERSION, tabId: "t" });
		send(engines, socket, { t: "attach", sessionId: "s1" });
		await settle();
		send(engines, socket, { t: "detach", sessionId: "s1" });

		finish(session);
		await settle();

		// It lets go, which only starts the idle countdown inside the session. It
		// never disposes, because another tab may already be subscribed to it.
		expect(calls.released).toBe(1);
		expect(calls.subscribed).toBe(0);
		expect(socket.data.unsubscribes.size).toBe(0);
	});

	test("a tab that stays subscribes and does not release", async () => {
		const { session, calls } = fakeSession();
		const engines: Engines = { ensure: async () => session, find: () => session };
		const socket = tab();
		send(engines, socket, { t: "hello", protocol: PROTOCOL_VERSION, tabId: "t" });
		send(engines, socket, { t: "attach", sessionId: "s1" });
		await settle();

		expect(calls.subscribed).toBe(1);
		expect(calls.released).toBe(0);
	});
});
