import { Effect } from "effect";

import { ImportFailed } from "#protocol/errors";

import { runCommand } from "../../platform/process.ts";

/**
 * The fetcher for pasted sources: the `skills` CLI, run as an installer in a staging
 * folder.
 *
 * It is the one approved child process besides an engine: it fetches files and never runs
 * the agent. The version is pinned, `-a pi --copy -y` writes plain copies without asking,
 * and the spawn is `runCommand`, so the deadline kills the whole process group and a
 * grandchild cannot hold the request open (F8e).
 */

/** The released `skills` version Epsilon runs. Bump deliberately, after trying it. */
export const skillsCliVersion = "1.7.2";

export type SkillsSource = {
	/** What the CLI is asked to fetch. */
	readonly source: string;
	/** The skill names the command asked for; empty means every skill in the source. */
	readonly skills: ReadonlyArray<string>;
};

export type SkillsCliOptions = {
	readonly cwd: string;
	readonly userHome: string;
	readonly timeoutMs: number;
	/** The environment handed to the CLI; `main.ts` publishes PATH once for children. */
	readonly env: Readonly<Record<string, string>>;
	/** The command to run, for a test that must not touch the network. */
	readonly command?: ReadonlyArray<string>;
};

// The CLI draws boxes and colors even when piped; keep only its words.
// oxlint-disable-next-line no-control-regex -- the escape byte is the point
const ansi = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** The few lines of CLI output worth showing: its own words, without the drawing. */
const cliMessage = (output: string): string => {
	const lines = output
		.replaceAll(ansi, "")
		.split(/\r?\n/)
		.map((line) => line.replace(/^[\s│├└┌◇◆■●○▲┐┘╮╯╭╰─]+/u, "").trim())
		.filter((line) => line !== "" && !line.startsWith("Tip:"));
	return lines.slice(-6).join(" ");
};

const commandFor = (parsed: SkillsSource, options: SkillsCliOptions): ReadonlyArray<string> => {
	if (options.command !== undefined) return options.command;
	return [
		process.execPath,
		"x",
		`skills@${skillsCliVersion}`,
		"add",
		parsed.source,
		"-a",
		"pi",
		"--copy",
		"-y",
		"-s",
		...(parsed.skills.length === 0 ? ["*"] : parsed.skills),
	];
};

/** Fetches one source into `cwd`; a refusal carries the CLI's own last words. */
export const skillsCli = (
	parsed: SkillsSource,
	options: SkillsCliOptions,
): Effect.Effect<void, ImportFailed> =>
	runCommand({
		command: commandFor(parsed, options),
		cwd: options.cwd,
		env: {
			...options.env,
			CI: "1",
			DISABLE_TELEMETRY: "1",
			DO_NOT_TRACK: "1",
			HOME: options.userHome,
			NO_COLOR: "1",
		},
		timeoutMs: options.timeoutMs,
	}).pipe(
		Effect.asVoid,
		Effect.catchTags({
			ProcessFailed: (error) =>
				Effect.fail(
					new ImportFailed({
						reason:
							cliMessage(error.stderr) || `The fetch failed (exit ${error.code ?? "signal"}).`,
						source: parsed.source,
					}),
				),
			TimedOut: () =>
				Effect.fail(
					new ImportFailed({
						reason: `The fetch took longer than ${Math.round(options.timeoutMs / 1000)} seconds and was stopped.`,
						source: parsed.source,
					}),
				),
		}),
	);
