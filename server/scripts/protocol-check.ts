/** S1 scaffolding: the failure paths of the socket, checked by hand. */
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

const killed = await new Promise<ServerFrame[]>((resolve) => {
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
				t: "rpc",
				sessionId,
				command: { type: "prompt", message: "count to twenty slowly, one number per line" },
			});
		}
		if (frame.t === "event" && frame.event.type === "agent_start") {
			const serverPid = execSync("pgrep -f 'src/serve.ts' | head -1").toString().trim();
			const childPid = execSync(`pgrep -P ${serverPid} | tail -1`).toString().trim();
			process.kill(Number(childPid), "SIGKILL");
		}
		if (frame.t === "error") {
			socket.close();
			resolve(frames);
		}
	});
	setTimeout(() => {
		socket.close();
		resolve(frames);
	}, 20_000);
});
report("kill mid-stream", killed);
process.exit(0);
