import { SettingsManager } from "@earendil-works/pi-coding-agent";

/**
 * A separate process that writes `settings.json` through pi's own manager, the way a
 * terminal pi or a live engine flush does. The F7 test needs a second process: pi locks
 * synchronously with a spin, so two writers in one process would deadlock the event loop
 * rather than test the lock.
 */

const agentDir = process.env["PI_CODING_AGENT_DIR"];
const cwd = process.argv[2];
if (agentDir === undefined || cwd === undefined) {
	process.stderr.write("usage: PI_CODING_AGENT_DIR=<dir> bun pi-settings-writer.ts <cwd>\n");
	process.exit(64);
}

const settings = SettingsManager.create(cwd, agentDir);
settings.setHideThinkingBlock(true);
process.stdout.write("written\n");
