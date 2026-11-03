/**
 * A child process that speaks a minimal version of the engine message set, so the
 * supervisor can be tested for spawn, response, crash and hang without running pi.
 *
 * Kept dependency-free on purpose: it must start even when the rest of the code does not
 * compile yet.
 */

type Message = { readonly type?: string } | undefined;

const send = (message: unknown): void => {
	process.send?.(message);
};

let silent = false;

process.on("message", (message: Message) => {
	if (silent) return;
	switch (message?.type) {
		case "init":
			send({ type: "ready", pid: process.pid });
			return;
		case "echo":
			send(message);
			return;
		case "hang":
			silent = true;
			return;
		case "crash":
			process.exit(9);
		case "shutdown":
			process.exit(0);
		default:
			send({ type: "unknown", received: message });
	}
});

send({ type: "started", pid: process.pid });
setInterval(() => undefined, 1000);
