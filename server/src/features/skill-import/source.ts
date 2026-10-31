/**
 * What a person pastes to import skills: an install command from a skills
 * site, a repository address, or `owner/repo`. Parsing is pure. Epsilon decides
 * where a skill lands, so the command's own placement flags are dropped; any
 * other command or flag is refused instead of passed through to a child process.
 */

export type ParsedSource = {
	/** What the `skills` CLI is asked to fetch. */
	source: string;
	/** The skill names the command asked for; empty means every skill in the source. */
	skills: string[];
};

/** Placement and prompt flags Epsilon sets itself; the command's own choice is ignored. */
const IGNORED_FLAGS = new Set([
	"-g",
	"--global",
	"-y",
	"--yes",
	"--copy",
	"--all",
	"-l",
	"--list",
	"--full-depth",
]);
/** Flags that take values Epsilon does not use. */
const IGNORED_VALUE_FLAGS = new Set(["-a", "--agent"]);
const SKILL_FLAGS = new Set(["-s", "--skill"]);
const SUBCOMMANDS_ADD = new Set(["add", "a", "install", "i"]);
const LAUNCHERS = new Set(["npx", "bunx", "pnpx", "pnpm", "yarn", "npm", "bun"]);

/** Splits a command line the way a shell would, without expanding anything. */
const shellWords = (line: string): string[] => {
	const words: string[] = [];
	let current = "";
	let started = false;
	let quote: '"' | "'" | undefined;
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index] ?? "";
		if (quote !== undefined) {
			if (char === quote) quote = undefined;
			else if (char === "\\" && quote === '"' && index + 1 < line.length) {
				index += 1;
				current += line[index];
			} else current += char;
		} else if (char === '"' || char === "'") {
			quote = char;
			started = true;
		} else if (/\s/.test(char)) {
			if (started) words.push(current);
			current = "";
			started = false;
		} else {
			current += char;
			started = true;
		}
	}
	if (quote !== undefined) throw new Error("The command has an unclosed quote");
	if (started) words.push(current);
	return words;
};

/**
 * Drops the launcher in front of the CLI: `npx -y skills@latest`, `bunx skills`,
 * `pnpm dlx skills`, `yarn dlx skills`. Returns what follows the CLI's own name,
 * or the words unchanged when the line is not a command at all.
 */
const afterLauncher = (words: string[]): string[] => {
	let rest = words[0] === "$" ? words.slice(1) : words;
	const first = rest[0];
	if (first !== undefined && LAUNCHERS.has(first)) {
		rest = rest.slice(1);
		if (rest[0] === "dlx" || rest[0] === "exec" || rest[0] === "x") rest = rest.slice(1);
		while (rest[0]?.startsWith("-") === true) rest = rest.slice(1);
	}
	const cli = rest[0];
	if (cli !== undefined && /^(skills|add-skill)(@[\w.-]+)?$/.test(cli)) {
		return cli.startsWith("add-skill") ? ["add", ...rest.slice(1)] : rest.slice(1);
	}
	return rest;
};

/** True for a source shape the `skills` CLI fetches over the network. */
const isRemoteSource = (source: string): boolean =>
	/^(https?:\/\/|git@|ssh:\/\/|git:\/\/|github:|gitlab:)/.test(source) ||
	/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?(@[\w.-]+)?$/.test(source);

const sourceProblem = (source: string): string | undefined => {
	if (/^(\.{0,2}\/|~|[A-Za-z]:[\\/])/.test(source) || source === "." || source === "..") {
		return "A folder on this computer is not a remote source. Use the folder or archive upload instead";
	}
	if (!isRemoteSource(source)) {
		return `"${source}" is not a GitHub or GitLab address, a git URL or owner/repo`;
	}
	return undefined;
};

/** Reads a pasted install command or source string; throws one sentence when it is not one. */
export const parseImportInput = (input: string): ParsedSource => {
	const line = input.trim();
	if (line === "") throw new Error("Paste an install command or a repository address");
	if (/[\r\n]/.test(line)) throw new Error("Paste a single command, not several lines");
	let words = afterLauncher(shellWords(line));

	const command = words[0];
	if (command !== undefined && SUBCOMMANDS_ADD.has(command)) words = words.slice(1);
	else if (
		command !== undefined &&
		!command.startsWith("-") &&
		!command.includes("/") &&
		!command.includes(":")
	) {
		throw new Error(
			`Epsilon imports skills with "skills add"; "${command}" is a different command. Paste the "add" command instead`,
		);
	}

	let source: string | undefined;
	const skills: string[] = [];
	for (let index = 0; index < words.length; index += 1) {
		const word = words[index] ?? "";
		const equals = word.startsWith("--") ? word.indexOf("=") : -1;
		const flag = equals === -1 ? word : word.slice(0, equals);
		if (!flag.startsWith("-")) {
			if (source !== undefined) throw new Error("Paste one source at a time");
			source = flag;
			continue;
		}
		if (SKILL_FLAGS.has(flag) || IGNORED_VALUE_FLAGS.has(flag)) {
			const values: string[] = equals === -1 ? [] : [word.slice(equals + 1)];
			while (
				equals === -1 &&
				words[index + 1] !== undefined &&
				!words[index + 1]?.startsWith("-")
			) {
				values.push(words[index + 1] ?? "");
				index += 1;
			}
			if (SKILL_FLAGS.has(flag)) skills.push(...values);
		} else if (!IGNORED_FLAGS.has(flag)) {
			throw new Error(
				`Epsilon does not support the ${flag} option; it picks the install place itself`,
			);
		}
	}
	if (source === undefined) throw new Error("The command names no source to install from");
	const problem = sourceProblem(source);
	if (problem !== undefined) throw new Error(problem);

	for (const name of skills) {
		if (name !== "*" && !/^[\w.-]+$/.test(name)) throw new Error(`"${name}" is not a skill name`);
	}
	return { source, skills: skills.includes("*") ? [] : [...new Set(skills)] };
};

/** The GitHub repository a source names, for the package check; undefined for anything else. */
export const githubRepoOf = (
	source: string,
): { owner: string; repo: string; ref?: string } | undefined => {
	const strip = (repo: string) => repo.replace(/\.git$/, "");
	const url =
		/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+).*)?\/?$/.exec(
			source,
		);
	if (url?.[1] !== undefined && url[2] !== undefined) {
		const found = { owner: url[1], repo: strip(url[2]) };
		return url[3] === undefined ? found : { ...found, ref: url[3] };
	}
	const ssh = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(source);
	if (ssh?.[1] !== undefined && ssh[2] !== undefined) return { owner: ssh[1], repo: strip(ssh[2]) };
	const short = /^(?:github:)?([\w.-]+)\/([\w.-]+?)(?:@[\w.-]+)?(?:\/[\w./-]+)?$/.exec(source);
	if (short?.[1] !== undefined && short[2] !== undefined && !/^(https?|ssh|git):/.test(source)) {
		return { owner: short[1], repo: strip(short[2]) };
	}
	return undefined;
};
