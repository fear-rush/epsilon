/**
 * Run a command with a hard deadline, and kill its whole process group.
 *
 * macOS has no `timeout`, and a check that starts a browser or a server is the usual way a
 * run hangs: the browser inherits the caller's stdout, so even after the check's own process
 * is killed, the pipeline reading that stdout waits for the browser to close. This spawns
 * the command detached with its own captured output and SIGKILLs the group at the deadline.
 *
 * bun run scripts/limit.ts 20 -- bun .sandbox/shots/shoot-page.ts <url> <out> <ready text>
 */
import { argv } from "node:process";

const [rawSeconds, ...rest] = argv.slice(2);
const separator = rest.indexOf("--");
const seconds = Number(rawSeconds);
const command = separator >= 0 ? rest.slice(separator + 1) : rest;

if (!Number.isFinite(seconds) || seconds <= 0 || command.length === 0) {
	process.stderr.write("usage: bun run scripts/limit.ts <seconds> -- <command…>\n");
	process.exit(2);
}

const child = Bun.spawn(command, {
	detached: true,
	stderr: "pipe",
	stdin: "ignore",
	stdout: "pipe",
});

/** The command's own children (a browser, a server) go with it, however it ends. */
const killGroup = (): void => {
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		// Already gone: the deadline is a bound, not a promise about what ran.
	}
};

const timer = setTimeout(() => {
	process.stderr.write(`limit: killing ${command.join(" ")} after ${seconds}s\n`);
	killGroup();
}, seconds * 1000);

const code = await child.exited;
clearTimeout(timer);
killGroup();

process.stdout.write(await new Response(child.stdout).text());
process.stderr.write(await new Response(child.stderr).text());
process.exit(code);
