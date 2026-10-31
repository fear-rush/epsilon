/**
 * The fetcher for pasted sources: the `skills` CLI, run as an installer in the
 * staging folder. It is an approved exception to "no child process" (it fetches
 * files and never runs the agent). It is pinned to one released version, never
 * given `-g`, and told with `-a pi --copy -y` to write plain copies without
 * asking, which land in `<cwd>/.agents/skills/<name>`.
 */
import type { ParsedSource } from "./source";

/** The released `skills` version Epsilon runs. Bump deliberately, after trying it. */
export const SKILLS_CLI_VERSION = "1.7.2";

const CLI_TIMEOUT_MS = 120_000;

/** Fetches a source into a staging folder; replaceable so tests never touch the network. */
export type SourceFetcher = (parsed: ParsedSource, cwd: string, userHome: string) => Promise<void>;

// The CLI draws boxes and colors even when piped; keep only its words.
// oxlint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** The few lines of CLI output worth showing: its own words, without the drawing. */
const cliMessage = (output: string): string => {
	const lines = output
		.replace(ANSI, "")
		.split(/\r?\n/)
		.map((line) =>
			line
				.replace(/^[\s│├└┌◇◆■●○▲┐┘╮╯╭╰─]+/u, "")
				.replace(/[\s│─╮╯┐┘]+$/u, "")
				.trim(),
		)
		.filter((line) => line !== "" && !/^Tip:/.test(line));
	return lines.slice(-6).join(" ");
};

export const runSkillsCli: SourceFetcher = async (parsed, cwd, userHome) => {
	const args = [
		process.execPath,
		"x",
		`skills@${SKILLS_CLI_VERSION}`,
		"add",
		parsed.source,
		"-a",
		"pi",
		"--copy",
		"-y",
		"-s",
		...(parsed.skills.length === 0 ? ["*"] : parsed.skills),
	];
	const child = Bun.spawn(args, {
		cwd,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			HOME: userHome,
			CI: "1",
			NO_COLOR: "1",
			DISABLE_TELEMETRY: "1",
			DO_NOT_TRACK: "1",
		},
	});
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill();
	}, CLI_TIMEOUT_MS);
	try {
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (timedOut) {
			throw new Error(
				`Fetching the source took longer than ${CLI_TIMEOUT_MS / 1000} seconds and was stopped`,
			);
		}
		if (code !== 0) {
			const said = cliMessage(`${stderr}\n${stdout}`);
			throw new Error(
				said === ""
					? `The skills installer failed (exit ${code})`
					: `The skills installer failed: ${said}`,
			);
		}
	} finally {
		clearTimeout(timer);
	}
};
