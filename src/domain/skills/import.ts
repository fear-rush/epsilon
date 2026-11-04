/**
 * What a person pastes to import skills, and how a staged source is searched.
 *
 * Parsing is pure. A pasted `skills` install command is accepted, but Epsilon decides
 * where a skill lands, so the command's own placement flags are dropped; any other
 * command or flag is refused instead of passed through to a child process.
 */

export type ImportSource = {
	/** What the `skills` CLI is asked to fetch. */
	readonly source: string;
	/** The skill names the command asked for; empty means every skill in the source. */
	readonly skills: ReadonlyArray<string>;
};

export type ImportSourceParse =
	| { readonly ok: true; readonly source: ImportSource }
	| { readonly ok: false; readonly reason: string };

/** Placement and prompt flags Epsilon sets itself; the command's own choice is ignored. */
const ignoredFlags = new Set([
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
const ignoredValueFlags = new Set(["-a", "--agent"]);
const skillFlags = new Set(["-s", "--skill"]);
const addCommands = new Set(["add", "a", "install", "i"]);
const launchers = new Set(["npx", "bunx", "pnpx", "pnpm", "yarn", "npm", "bun"]);

/** Splits a command line the way a shell would, without expanding anything. */
type WordParse =
	| { readonly ok: true; readonly words: ReadonlyArray<string> }
	| { readonly ok: false; readonly reason: string };

const shellWords = (line: string): WordParse => {
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
	if (quote !== undefined) return { ok: false, reason: "The command has an unclosed quote" };
	if (started) words.push(current);
	return { ok: true, words };
};

/** Drops the launcher in front of the CLI: `npx -y skills@latest`, `bunx skills`. */
const afterLauncher = (words: ReadonlyArray<string>): ReadonlyArray<string> => {
	let rest = words[0] === "$" ? words.slice(1) : [...words];
	const first = rest[0];
	if (first !== undefined && launchers.has(first)) {
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

/** Reads a pasted install command or source string, or says why it is neither. */
export const parseImportInput = (input: string): ImportSourceParse => {
	const line = input.trim();
	if (line === "") return { ok: false, reason: "Paste an install command or a repository address" };
	if (/[\r\n]/.test(line))
		return { ok: false, reason: "Paste a single command, not several lines" };
	const parsedWords = shellWords(line);
	if (!parsedWords.ok) return parsedWords;
	let rest = [...afterLauncher(parsedWords.words)];

	const command = rest[0];
	if (command !== undefined && addCommands.has(command)) rest = rest.slice(1);
	else if (
		command !== undefined &&
		!command.startsWith("-") &&
		!command.includes("/") &&
		!command.includes(":")
	) {
		return {
			ok: false,
			reason: `Epsilon imports skills with "skills add"; "${command}" is a different command. Paste the "add" command instead`,
		};
	}

	let source: string | undefined;
	const skills: string[] = [];
	for (let index = 0; index < rest.length; index += 1) {
		const word = rest[index] ?? "";
		const equals = word.startsWith("--") ? word.indexOf("=") : -1;
		const flag = equals === -1 ? word : word.slice(0, equals);
		if (!flag.startsWith("-")) {
			if (source !== undefined) return { ok: false, reason: "Paste one source at a time" };
			source = flag;
			continue;
		}
		if (skillFlags.has(flag) || ignoredValueFlags.has(flag)) {
			const values: string[] = equals === -1 ? [] : [word.slice(equals + 1)];
			if (equals === -1) {
				let next = rest[index + 1];
				while (next !== undefined && !next.startsWith("-")) {
					values.push(next);
					index += 1;
					next = rest[index + 1];
				}
			}
			if (skillFlags.has(flag)) skills.push(...values);
		} else if (!ignoredFlags.has(flag)) {
			return {
				ok: false,
				reason: `Epsilon does not support the ${flag} option; it picks the install place itself`,
			};
		}
	}
	if (source === undefined)
		return { ok: false, reason: "The command names no source to install from" };
	const problem = sourceProblem(source);
	if (problem !== undefined) return { ok: false, reason: problem };
	for (const name of skills) {
		if (name !== "*" && !/^[\w.-]+$/.test(name)) {
			return { ok: false, reason: `"${name}" is not a skill name` };
		}
	}
	return {
		ok: true,
		source: { source, skills: skills.includes("*") ? [] : [...new Set(skills)] },
	};
};

/** Where the `skills` CLI looks before it searches everything, in its order. */
const searchDirs = [
	"skills",
	"skills/.curated",
	"skills/.experimental",
	"skills/.system",
	".agents/skills",
	".claude/skills",
];
const searchDepth = 3;

const dirOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
const depthOf = (dir: string): number => (dir === "" ? 0 : dir.split("/").length);

/** Drops every folder that sits inside another skill: a skill is not searched for skills. */
const outermost = (dirs: ReadonlyArray<string>): ReadonlyArray<string> =>
	dirs.filter((dir) => !dirs.some((other) => other !== dir && dir.startsWith(`${other}/`)));

/**
 * The skill folders in a staged source, relative to it. A `SKILL.md` at the root makes
 * the source itself the one skill. Otherwise the CLI's usual places are searched three
 * levels deep, and only when they hold nothing is the whole tree. A file named
 * `skill.md` counts, so validation can say how to rename it.
 */
export const discoverSkillDirs = (paths: ReadonlyArray<string>): ReadonlyArray<string> => {
	const dirs = new Set(
		paths
			.filter((path) => nameOf(path).toLowerCase() === "skill.md")
			.filter((path) => !path.split("/").some((part) => part === ".git" || part === "node_modules"))
			.map(dirOf),
	);
	if (dirs.has("")) return [""];
	const preferred = new Set<string>();
	for (const search of searchDirs) {
		for (const dir of dirs) {
			if (dir.startsWith(`${search}/`) && depthOf(dir) - depthOf(search) <= searchDepth) {
				preferred.add(dir);
			}
		}
	}
	return [...outermost([...(preferred.size > 0 ? preferred : dirs)])].toSorted();
};

const fence = /^(```|~~~)[\s\S]*?^\1[ \t]*$/gm;
const link = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/** Relative file targets of the markdown links in a body, resolved against the skill folder. */
export const relativeLinkTargets = (body: string): ReadonlyArray<string> => {
	const targets: string[] = [];
	for (const match of body.replaceAll(fence, "").matchAll(link)) {
		const raw = match[1] ?? "";
		if (raw.startsWith("#") || raw.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
		let target = raw.replace(/[?#].*$/, "");
		try {
			target = decodeURIComponent(target);
		} catch {
			// A malformed escape stays as typed; the file check then reports it missing.
		}
		const stack: string[] = [];
		for (const part of target.split("/")) {
			if (part === "" || part === ".") continue;
			if (part === "..") stack.pop();
			else stack.push(part);
		}
		if (stack.length > 0) targets.push(stack.join("/"));
	}
	return [...new Set(targets)];
};
