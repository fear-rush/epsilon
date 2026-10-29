/**
 * Checks the two things a tab has to get right: every attached session keeps its
 * own subscription, and the extension's display-only methods reach the page,
 * including on a late attach.
 */
import type { ServerFrame } from "shared";

import { SOCKET_URL, answerTo, hello, parseFrame, send as sendFrame } from "./socket";
const sessionA = crypto.randomUUID();
const sessionB = crypto.randomUUID();

type Tab = { socket: WebSocket; frames: ServerFrame[]; ready: Promise<void> };

const openTab = (): Tab => {
	const socket = new WebSocket(SOCKET_URL);
	const frames: ServerFrame[] = [];
	let markReady: () => void = () => undefined;
	const ready = new Promise<void>((resolve) => {
		markReady = resolve;
	});
	socket.addEventListener("message", (message) => {
		const frame = parseFrame(message.data);
		frames.push(frame);
		if (frame.t === "welcome") markReady();
		if (frame.t === "dialog") {
			send(socket, {
				t: "dialog",
				sessionId: frame.sessionId,
				answer: answerTo(frame.request),
			});
		}
	});
	socket.addEventListener("open", () => send(socket, hello("check")));
	return { socket, frames, ready };
};

const send = (socket: WebSocket, frame: Parameters<typeof sendFrame>[1]) =>
	sendFrame(socket, frame);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const uiMethods = (frames: ServerFrame[]) =>
	frames
		.filter((frame): frame is ServerFrame & { t: "ui" } => frame.t === "ui")
		.map((frame) => frame.request.method)
		.join(" ") || "none";

const tabA = openTab();
await tabA.ready;
send(tabA.socket, { t: "attach", sessionId: sessionA });
await sleep(5000);
console.log(`first attach, ui frames: ${uiMethods(tabA.frames)}`);
console.log(`first attach, snapshots: ${tabA.frames.filter((f) => f.t === "snapshot").length}`);

const tabLate = openTab();
await tabLate.ready;
send(tabLate.socket, { t: "attach", sessionId: sessionA });
await sleep(3000);
console.log(`late attach, ui frames: ${uiMethods(tabLate.frames)}`);

// Two sessions on one tab, then detach one while the other keeps working.
const tabTwo = openTab();
await tabTwo.ready;
send(tabTwo.socket, { t: "attach", sessionId: sessionA });
send(tabTwo.socket, { t: "attach", sessionId: sessionB });
await sleep(2500);
const snapshots = tabTwo.frames.filter((f) => f.t === "snapshot");
console.log(
	`two attaches: ${new Set(snapshots.map((frame) => (frame.t === "snapshot" ? frame.sessionId : ""))).size} sessions with a snapshot, ${snapshots.length} snapshots`,
);

send(tabTwo.socket, { t: "detach", sessionId: sessionA });
await sleep(500);
const beforeDetachCount = tabTwo.frames.length;

// A second tab drives session A. The first tab dropped it and must stay quiet.
const driver = openTab();
await driver.ready;
send(driver.socket, { t: "attach", sessionId: sessionA });
send(driver.socket, {
	t: "command",
	sessionId: sessionA,
	command: { type: "prompt", text: "Say only: ok" },
});
send(driver.socket, {
	t: "command",
	sessionId: sessionB,
	command: { type: "prompt", text: "Say only: ok" },
});
await sleep(9000);

const afterDetach = tabTwo.frames.slice(beforeDetachCount);
const straysForA = afterDetach.filter(
	(frame) => "sessionId" in frame && frame.sessionId === sessionA,
);
const forB = afterDetach.filter((frame) => "sessionId" in frame && frame.sessionId === sessionB);
console.log(`after detach A: ${straysForA.length} frames for A, ${forB.length} frames for B`);
process.exit(straysForA.length === 0 && forB.length > 0 ? 0 : 1);
