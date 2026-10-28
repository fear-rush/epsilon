/** The failure paths of the socket, checked by hand against a running server. */
import { execSync } from "node:child_process";
import { PROTOCOL_VERSION, clientFrameSchema, serverFrameSchema } from "shared";
import type { ClientFrame, ServerFrame } from "shared";

const URL = "ws://127.0.0.1:3000/api/link";

const once = (open: (socket: WebSocket) => void): Promise<ServerFrame[]> =>
	new Promise((resolve) => {
		const socket = new WebSocket(URL);
		const frames: ServerFrame[] = [];
		socket.addEventListener("open", () => open(socket));
		socket.addEventListener("message", (message) => {
			frames.push(serverFrameSchema.parse(JSON.parse(String(message.data))));
		});
		setTimeout(() => {
			socket.close();
			resolve(frames);
		}, 1500);
	});

const send = (socket: WebSocket, frame: ClientFrame) =>
	socket.send(JSON.stringify(clientFrameSchema.parse(frame)));

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

const unsupported = await once((socket) => {
	send(socket, { t: "hello", protocol: PROTOCOL_VERSION, tabId: "check" });
	send(socket, { t: "terminal", terminalId: "t1", input: "ls" });
});
report("terminal frame", unsupported);

/** One real turn in this process, then prove no `pi` child was spawned for it. */
const embedded = await new Promise<ServerFrame[]>((resolve) => {
	const sessionId = crypto.randomUUID();
	const socket = new WebSocket(URL);
	const frames: ServerFrame[] = [];
	socket.addEventListener("open", () =>
		send(socket, { t: "hello", protocol: PROTOCOL_VERSION, tabId: "check" }),
	);
	socket.addEventListener("message", (message) => {
		const frame = serverFrameSchema.parse(JSON.parse(String(message.data)));
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
