/** The failure paths of the socket, checked by hand against a running server. */
import { execSync } from "node:child_process";
import { PROTOCOL_VERSION } from "shared";
import type { ServerFrame } from "shared";

import { SOCKET_URL as URL, hello, parseFrame, send as sendFrame } from "./socket";

const once = (open: (socket: WebSocket) => void): Promise<ServerFrame[]> =>
	new Promise((resolve) => {
		const socket = new WebSocket(URL);
		const frames: ServerFrame[] = [];
		socket.addEventListener("open", () => open(socket));
		socket.addEventListener("message", (message) => {
			frames.push(parseFrame(message.data));
		});
		setTimeout(() => {
			socket.close();
			resolve(frames);
		}, 1500);
	});

const send = (socket: WebSocket, frame: Parameters<typeof sendFrame>[1]) =>
	sendFrame(socket, frame);

const report = (name: string, frames: ServerFrame[]) => {
	const brief = frames.map((frame) => (frame.t === "error" ? `error:${frame.code}` : frame.t));
	console.log(`${name}: ${brief.join(" ") || "no frames"}`);
};

const wrongVersion = await once((socket) =>
	send(socket, { t: "hello", protocol: PROTOCOL_VERSION + 1, tabId: "check" }),
);
report("wrong version", wrongVersion);

const beforeHello = await once((socket) => send(socket, { t: "attach", sessionId: "x" }));
report("attach before hello", beforeHello);

/** One real turn in this process, then prove no `pi` child was spawned for it. */
const embedded = await new Promise<ServerFrame[]>((resolve) => {
	const sessionId = crypto.randomUUID();
	const socket = new WebSocket(URL);
	const frames: ServerFrame[] = [];
	socket.addEventListener("open", () => send(socket, hello("check")));
	socket.addEventListener("message", (message) => {
		const frame = parseFrame(message.data);
		frames.push(frame);
		if (frame.t === "welcome") {
			send(socket, { t: "attach", sessionId });
			send(socket, {
				t: "command",
				sessionId,
				command: { type: "prompt", text: "Say only: ok" },
			});
		}
		if (frame.t === "event" && frame.event.type === "agent_settled") {
			const children = execSync("pgrep -f 'mode rpc' || true").toString().trim();
			console.log(children === "" ? "embedded turn: no pi child" : `pi children: ${children}`);
			socket.close();
			resolve(frames);
		}
	});
	setTimeout(() => {
		socket.close();
		resolve(frames);
	}, 90_000);
});
report("embedded turn", embedded);
process.exit(0);
