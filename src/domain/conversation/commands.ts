/**
 * pi's built-in slash commands, exactly as `dist/core/slash-commands.js` lists them,
 * plus who answers each one in Epsilon.
 *
 * pi's TUI implements these in its editor, and `AgentSession.prompt()` dispatches
 * only extension commands, prompt templates and skills. So a name in this table must
 * never reach the model: the browser acts, or the host does, and whichever one cannot
 * says why. A name the table does not hold stays a prompt, which is how an extension
 * command, a template and a `/skill:` entry still reach pi.
 */
export type BuiltinCommand = {
	/** pi's name, without the slash. */
	name: string;
	/**
	 * Who performs it. `"pi"` means the host calls pi's own session operation, and the
	 * tab only sees the result; `"epsilon"` means the browser owns the surface: a
	 * route, a dialog, the clipboard or a download.
	 */
	surface: "pi" | "epsilon";
	/** pi's own sentence, so the palette reads the same as the terminal. */
	description: string;
	argumentHint?: string;
	/**
	 * Why this build cannot run it, in the words the tab shows instead. A refusal is a
	 * sentence that names where the ability lives, never a silent no-op
	 * (docs/DECISIONS.md, UI contract). Absent when the command has a web surface.
	 */
	refusal?: string;
};

export const BUILTIN_COMMANDS = [
	{
		name: "settings",
		description: "Open settings menu",
		surface: "epsilon",
	},
	{
		name: "model",
		description: "Select model (opens selector UI)",
		argumentHint: "<provider/model>",
		surface: "epsilon",
	},
	{
		name: "tree",
		description: "Navigate session tree (switch branches)",
		surface: "epsilon",
	},
	{
		name: "thinking",
		description: "Set thinking level",
		argumentHint: "<level>",
		surface: "epsilon",
	},
	{
		name: "scoped-models",
		description: "Enable/disable models for Ctrl+P cycling",
		surface: "epsilon",
	},
	{
		name: "export",
		description: "Export session (HTML default, or specify path: .html/.jsonl)",
		argumentHint: "[.jsonl]",
		surface: "epsilon",
	},
	{
		name: "import",
		description: "Import and resume a session from a JSONL file",
		argumentHint: "<path.jsonl>",
		surface: "pi",
	},
	{
		name: "share",
		description: "Share session via a Radius artifact or a GitHub gist",
		surface: "epsilon",
		refusal:
			"pi's /share publishes the session through Radius or a gist, and the SDK exports no share function. Run `pi /share` in a terminal.",
	},
	{
		name: "bug",
		description: "Report a bug to the Pi developers",
		argumentHint: "<description>",
		surface: "epsilon",
		refusal:
			"pi's /bug collects this machine's diagnostics and writes a report. Run `pi /bug` in a terminal.",
	},
	{
		name: "copy",
		description: "Copy last agent message to clipboard",
		surface: "epsilon",
	},
	{
		name: "name",
		description: "Set session display name",
		argumentHint: "<name>",
		surface: "pi",
	},
	{
		name: "session",
		description: "Show session info and stats",
		surface: "epsilon",
	},
	{
		name: "changelog",
		description: "Show changelog entries",
		surface: "epsilon",
		refusal: "pi's changelog ships with the CLI. Run `pi /changelog` in a terminal.",
	},
	{
		name: "hotkeys",
		description: "Show all keyboard shortcuts",
		surface: "epsilon",
	},
	{
		name: "fork",
		description: "Create a new fork from a previous user message",
		surface: "epsilon",
	},
	{
		name: "clone",
		description: "Duplicate the current session at the current position",
		surface: "epsilon",
	},
	{
		name: "trust",
		description: "Save project trust decision for future sessions",
		surface: "epsilon",
		refusal:
			"pi records trust per folder, and Epsilon asks when you open a folder. There is no trust list to edit here yet; run `pi /trust` in a terminal to record one now.",
	},
	{
		name: "login",
		description: "Configure provider authentication",
		argumentHint: "<provider>",
		surface: "epsilon",
	},
	{
		name: "logout",
		description: "Remove provider authentication",
		surface: "epsilon",
	},
	{
		name: "new",
		description: "Start a new session",
		surface: "pi",
	},
	{
		name: "compact",
		description: "Manually compact the session context",
		argumentHint: "[instructions]",
		surface: "pi",
	},
	{
		name: "resume",
		description: "Resume a different session",
		surface: "epsilon",
	},
	{
		name: "reload",
		description: "Reload keybindings, extensions, skills, prompts, themes, and context files",
		surface: "pi",
	},
	{
		name: "quit",
		description: "Quit pi",
		surface: "epsilon",
		refusal:
			"Epsilon keeps serving after a tab closes, so there is nothing to quit here: close the tab.",
	},
] as const satisfies readonly BuiltinCommand[];

/** The names the host runs: the engine's built-in router answers these. */
export type HostCommandName = Extract<(typeof BUILTIN_COMMANDS)[number], { surface: "pi" }>["name"];

/**
 * The browser-surface names that act. A row with a `refusal` never reaches a
 * handler: its sentence is the whole answer.
 */
export type ComposerCommandName = Extract<
	(typeof BUILTIN_COMMANDS)[number],
	{ surface: "epsilon"; refusal?: undefined }
>["name"];

/** One entry of the table, by pi's name, or undefined for a name pi does not have. */
export const builtinCommand = (name: string): BuiltinCommand | undefined =>
	BUILTIN_COMMANDS.find((command) => command.name === name);

/**
 * pi's names are lowercase letters and dashes, so a path or a URL after `/` is a
 * prompt, not a command. `argument` is everything after the name, trimmed.
 */
const COMMAND_PATTERN = /^\/([a-z][a-z-]*)(?:[ \t\r\n]+([\s\S]*))?$/;

export type ParsedBuiltinCommand = { command: BuiltinCommand; argument: string };

/** `/name rest` when `name` is in the table; undefined keeps the text a prompt. */
export const parseBuiltinCommand = (text: string): ParsedBuiltinCommand | undefined => {
	const match = COMMAND_PATTERN.exec(text.trim());
	if (match === null) return undefined;
	const command = builtinCommand(match[1] ?? "");
	if (command === undefined) return undefined;
	return { command, argument: (match[2] ?? "").trim() };
};
