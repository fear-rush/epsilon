/**
 * S1 scaffolding: drive `agent/driver.ts` from a terminal and print every event
 * raw, or save it as a fixture. Deleted when the socket replaces it.
 *
 *   bun run scripts/trace-rpc.ts                    # get_state only
 *   PROMPT="..." bun run scripts/trace-rpc.ts       # one real turn
 *   TRACE_LOG=out.jsonl PROMPT="..." bun ...        # also keep every frame
 *
 * AUTO_CONFIRM answers every extension dialog with yes. A tool call blocks on a
 * `confirm` until something answers it.
 */
import { appendFileSync, writeFileSync } from "node:fs";

import { Driver } from "../src/agent/driver.ts";
import { config } from "../src/config.ts";

const prompt = process.env.PROMPT;
const logPath = process.env.TRACE_LOG;
const autoConfirm = process.env.AUTO_CONFIRM === "1";
const dialogMethods = new Set(["confirm", "select", "input", "editor"]);

if (logPath) writeFileSync(logPath, "");
const record = (line: string) => {
	if (logPath) appendFileSync(logPath, `${line}\n`);
};

const driver = new Driver({
	session: { kind: "id", id: crypto.randomUUID() },
	cwd: process.cwd(),
	agentHome: config.agentHome,
	onFrame: (frame) => {
		const line = JSON.stringify(frame);
		console.log(`< ${line}`);
		record(line);
		if (frame.type === "extension_ui_request" && autoConfirm) {
			if (dialogMethods.has(frame.method)) {
				driver.send({ type: "extension_ui_response", id: frame.id, confirmed: true });
			}
		}
		if (frame.type === "agent_settled") {
			console.log("# agent settled");
			driver.kill();
		}
	},
	onExit: (info) => {
		console.log(`# exit code=${info.code} signal=${info.signal} requested=${info.requested}`);
		if (info.stderr !== "") console.log(`# stderr: ${info.stderr}`);
		process.exit(0);
	},
});

driver.send({ type: "get_state" });
if (prompt) driver.send({ type: "prompt", message: prompt });
setTimeout(
	() => {
		console.log("# timeout");
		driver.kill();
	},
	Number(process.env.TRACE_TIMEOUT_MS ?? 120_000),
);
