/**
 * S1 scaffolding: spawn the pinned pi as `--mode rpc`, print every stdout line
 * raw and optionally save it. Deleted when the driver replaces it (see S1).
 *
 *   bun run scripts/trace-rpc.ts                    # get_state only
 *   PROMPT="..." bun run scripts/trace-rpc.ts       # one real turn
 *   TRACE_LOG=out.jsonl PROMPT="..." bun ...        # also keep the raw lines
 *
 * AUTO_CONFIRM answers every extension dialog with yes. A tool call blocks on a
 * `confirm` from the permission extension until something answers it.
 */
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { z } from "zod";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("@earendil-works/pi-coding-agent/package.json");
const bin = join(dirname(pkgPath), require(pkgPath).bin.pi);

const prompt = process.env.PROMPT;
const autoConfirm = process.env.AUTO_CONFIRM === "1";

/** The only three commands this trace sends. */
type TraceCommand =
	| { type: "get_state" }
	| { type: "prompt"; message: string }
	| { type: "extension_ui_response"; id: string; confirmed: boolean; value: string };
const logPath = process.env.TRACE_LOG;
const timeoutMs = Number(process.env.TRACE_TIMEOUT_MS ?? 120_000);
const args = ["--mode", "rpc", "--no-session"];

if (logPath) writeFileSync(logPath, "");
const record = (line: string, direction: "in" | "out") => {
	if (logPath) appendFileSync(logPath, `${JSON.stringify({ direction, line })}\n`);
};

console.log(`$ ${bin} ${args.join(" ")}`);
const child = spawn(bin, args, { stdio: ["pipe", "pipe", "inherit"], cwd: process.cwd() });

const dialogMethods = new Set(["confirm", "select", "input", "editor"]);
const dialogRequestSchema = z.object({
	type: z.literal("extension_ui_request"),
	id: z.string(),
	method: z.string(),
});

const send = (command: TraceCommand) => {
	const line = JSON.stringify({ id: crypto.randomUUID(), ...command });
	console.log(`> ${line}`);
	record(line, "in");
	child.stdin.write(`${line}\n`);
};

let settled = false;
const finish = (reason: string) => {
	if (settled) return;
	settled = true;
	console.log(`# ${reason}`);
	child.kill();
	setTimeout(() => process.exit(0), 200);
};

child.stdout.setEncoding("utf8");
let buffer = "";
child.stdout.on("data", (chunk: string) => {
	buffer += chunk;
	let newline = buffer.indexOf("\n");
	while (newline !== -1) {
		const line = buffer.slice(0, newline);
		buffer = buffer.slice(newline + 1);
		console.log(`< ${line}`);
		record(line, "out");
		if (autoConfirm && line.includes('"type":"extension_ui_request"')) {
			const request = dialogRequestSchema.safeParse(JSON.parse(line));
			if (request.success && dialogMethods.has(request.data.method)) {
				send({
					type: "extension_ui_response",
					id: request.data.id,
					confirmed: true,
					value: "yes",
				});
			}
		}
		if (line.includes('"type":"agent_settled"')) finish("agent settled");
		newline = buffer.indexOf("\n");
	}
});

child.on("exit", (code, signal) => {
	console.log(`# child exited code=${code} signal=${signal}`);
	process.exit(0);
});

send({ type: "get_state" });
if (prompt) send({ type: "prompt", message: prompt });
setTimeout(() => finish("timeout"), timeoutMs);
