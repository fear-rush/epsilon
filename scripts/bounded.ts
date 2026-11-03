/**
 * A hard outer bound for a command, because macOS has no `timeout` and a hung check must
 * not hang the agent that started it.
 *
 *   bun run scripts/bounded.ts <seconds> -- <command...>
 *
 * The command runs in its own process group, so killing the group also kills its
 * children. Exit code 124 means the deadline won.
 */

type Signal = "SIGINT" | "SIGTERM" | "SIGKILL";

/** Runs `command` with a deadline and returns its exit code, or 124 when the deadline won. */
export async function runBounded(seconds: number, command: ReadonlyArray<string>): Promise<number> {
	const child = Bun.spawn([...command], {
		detached: true,
		stderr: "inherit",
		stdin: "ignore",
		stdout: "inherit",
	});

	const killGroup = (signal: Signal): void => {
		try {
			process.kill(-child.pid, signal);
		} catch {
			// The group is already gone.
		}
	};

	const deadline = setTimeout(() => {
		process.stderr.write(`bounded: ${seconds} s deadline reached, killing the process group\n`);
		killGroup("SIGKILL");
		process.exit(124);
	}, seconds * 1000);

	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => killGroup(signal));
	}

	const code = await child.exited;
	clearTimeout(deadline);
	return code;
}

const argv = process.argv.slice(2);
const separator = argv.indexOf("--");
const seconds = Number(argv[0]);
const command = separator < 1 ? [] : argv.slice(separator + 1);

if (separator < 1 || !Number.isFinite(seconds) || seconds <= 0 || command.length === 0) {
	process.stderr.write("usage: bun run scripts/bounded.ts <seconds> -- <command...>\n");
	process.exit(64);
}

process.exit(await runBounded(seconds, command));
