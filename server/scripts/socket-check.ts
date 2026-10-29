import type { ServerFrame } from "shared";

import { SOCKET_URL as url, answerTo, hello, parseFrame, send as sendFrame } from "./socket";
const sessionId = process.argv[2] ?? crypto.randomUUID();
/** With an argument this script only attaches, to prove an existing session reads back. */
const attachOnly = process.argv[2] !== undefined;
const socket = new WebSocket(url);
const seen: string[] = [];
let answered = 0;

const send = (frame: Parameters<typeof sendFrame>[1]) => sendFrame(socket, frame);
const show = (frame: ServerFrame) => {
	if (frame.t === "event") return frame.event.type;
	if (frame.t === "dialog") return `dialog:${frame.request.method}:${frame.request.id.slice(0, 8)}`;
	if (frame.t === "error") return `error:${frame.code}`;
	return frame.t;
};

socket.addEventListener("open", () => {
	send(hello("check"));
});
socket.addEventListener("message", (message) => {
	const frame = parseFrame(message.data);
	const label = show(frame);
	seen.push(label);
	console.log("<-", label);

	if (frame.t === "welcome") {
		send({ t: "attach", sessionId });
		if (!attachOnly) {
			send({
				t: "command",
				sessionId,
				command: { type: "prompt", text: "Run bash 'echo s1-ok' and reply with its output." },
			});
		}
	}
	if (attachOnly && frame.t === "snapshot") {
		const savePath = process.env.SAVE_SNAPSHOT;
		if (savePath !== undefined) {
			Bun.write(savePath, JSON.stringify(frame));
		}
		console.log(`--- snapshot: ${frame.snapshot.messages.length} messages ---`);
		for (const message of frame.snapshot.messages) {
			console.log(`  ${message.role}: ${JSON.stringify(message).slice(0, 90)}`);
		}
		process.exit(0);
	}
	if (frame.t === "dialog" && answered === 0) {
		answered += 1;
		send({
			t: "dialog",
			sessionId,
			answer: answerTo(frame.request),
		});
	}
	if (frame.t === "event" && frame.event.type === "agent_settled") {
		const counts = new Map<string, number>();
		for (const name of seen) counts.set(name, (counts.get(name) ?? 0) + 1);
		console.log("--- summary ---");
		console.log([...counts].map(([name, count]) => `${name}x${count}`).join(" "));
		process.exit(0);
	}
	if (frame.t === "error") process.exit(2);
});
setTimeout(() => {
	console.log("TIMEOUT after", seen.length, "frames");
	process.exit(1);
}, 90_000);
