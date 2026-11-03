/**
 * A child process that speaks the engine IPC schema, so the supervisor can be tested for
 * spawn, response, crash, silence and shutdown without running pi.
 *
 * Kept dependency-free on purpose: it must start even when the rest of the code does not
 * compile yet. A test selects a behaviour with `FAKE_ENGINE_MODE`:
 *
 * - `normal` (default): ready, heartbeats, replies, exits on shutdown
 * - `silent`: ready, then no heartbeats (the watchdog must kill it)
 * - `crash`: exits 9 on `init`
 * - `ignore-shutdown`: never exits on `shutdown` (the deadline must kill it)
 */

const mode = process.env["FAKE_ENGINE_MODE"] ?? "normal";
const send = (message: unknown): void => {
	process.send?.(message);
};

let silent = mode === "silent";
let sessionId = "fake";
let sequence = 0;

const heartbeat = (): void => {
	if (silent) return;
	sequence++;
	const usage = process.memoryUsage();
	send({
		childPids: [],
		heapUsed: usage.heapUsed,
		loopLagMs: 0,
		rss: usage.rss,
		seq: sequence,
		t: "heartbeat",
	});
};

setInterval(heartbeat, 100);

process.on("message", (message: unknown) => {
	if (typeof message !== "object" || message === null || !("t" in message)) return;
	const tag = message.t;
	switch (tag) {
		case "init": {
			if (mode === "crash") process.exit(9);
			const input = message as { sessionId?: string };
			sessionId = input.sessionId ?? "fake";
			send({ sessionId, t: "ready" });
			heartbeat();
			return;
		}
		case "subscribe": {
			const tab = String((message as Record<string, unknown>)["tab"]);
			send({
				frame: {
					entries: [
						{
							id: "u1",
							images: [],
							parentId: null,
							role: "user",
							text: "hello from the fake engine",
							ts: 1,
						},
					],
					hasOlder: false,
					notices: [],
					sessionId,
					t: "snapshot",
				},
				t: "frame",
				to: { tab },
			});
			return;
		}
		case "command": {
			const input = message as unknown as {
				id: string;
				command?: { t?: string; text?: string };
				tab: string;
			};
			if (input.command?.text === "crash") process.exit(9);
			if (input.command?.text === "hang") {
				silent = true;
				return;
			}
			if (input.command?.text === "rekey") {
				const from = sessionId;
				sessionId = `${from}-new`;
				send({ from, t: "rekey", to: sessionId });
				send({ id: input.id, ok: true, t: "reply", value: { rekeyed: sessionId } });
				return;
			}
			if (input.command?.t === "prompt") {
				// A prompt is acknowledged, then the turn is reported as an append.
				send({ id: input.id, ok: true, t: "reply", value: { disposition: "started" } });
				send({
					frame: {
						entry: {
							blocks: [{ text: "fake reply", type: "text" }],
							id: "a1",
							parentId: "u1",
							role: "assistant",
							ts: 2,
						},
						t: "append",
					},
					t: "frame",
					to: "all",
				});
				return;
			}
			send({ id: input.id, ok: true, t: "reply", value: { command: input.command?.t } });
			return;
		}
		case "query":
			send({
				id: (message as Record<string, unknown>)["id"],
				ok: true,
				t: "reply",
				value: { kind: (message as Record<string, unknown>)["kind"] },
			});
			return;
		case "shutdown":
			if (mode === "ignore-shutdown") return;
			process.exit(0);
		default:
			return;
	}
});
