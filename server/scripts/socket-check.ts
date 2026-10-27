import { PROTOCOL_VERSION, clientFrameSchema, serverFrameSchema } from "shared";
import type { ClientFrame, ServerFrame } from "shared";

const url = "ws://127.0.0.1:3000/api/link";
const sessionId = process.argv[2] ?? crypto.randomUUID();
const socket = new WebSocket(url);
const seen: string[] = [];
let answered = 0;

const send = (frame: ClientFrame) => socket.send(JSON.stringify(clientFrameSchema.parse(frame)));
const show = (frame: ServerFrame) => {
	if (frame.t === "event") return frame.event.type;
	if (frame.t === "dialog") return `dialog:${frame.request.method}:${frame.request.id.slice(0, 8)}`;
	if (frame.t === "error") return `error:${frame.code}`;
	if (frame.t === "meta") return `meta running=${frame.running} needsInput=${frame.needsInput}`;
	return frame.t;
};

socket.addEventListener("open", () => {
	send({ t: "hello", protocol: PROTOCOL_VERSION, tabId: "check" });
});
socket.addEventListener("message", (message) => {
	const frame = serverFrameSchema.parse(JSON.parse(String(message.data)));
	const label = show(frame);
	seen.push(label);
	console.log("<-", label);

	if (frame.t === "welcome") {
		send({ t: "attach", sessionId });
		send({
			t: "rpc",
			sessionId,
			command: { type: "prompt", message: "Run bash 'echo s1-ok' and reply with its output." },
		});
	}
	if (frame.t === "dialog" && answered === 0) {
		answered += 1;
		send({
			t: "dialog",
			sessionId,
			answer: { type: "extension_ui_response", id: frame.request.id, confirmed: true },
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
