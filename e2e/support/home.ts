/**
 * The end-to-end run's own agent home, under the dev sandbox (`<repo>/.sandbox/e2e`,
 * a link outside the repository and `~`). Everything the app reads is written here,
 * never in `~/.pi`: the real CommandCode provider from `server/.env`, one provider
 * whose endpoint refuses connections, one that exists only to be deleted, several
 * MCP servers (global, project, override, invalid), skills in every editable root,
 * a package, other agents' skill folders, and five sessions.
 *
 * The provider is real on purpose: a turn goes to CommandCode, so streaming, tool
 * calls, permissions and model switching are exercised against a real API. The
 * tests skip the turn tests when `server/.env` holds no key instead of inventing a
 * provider response.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { sandboxRoot } from "../../scripts/sandbox";

const REPO_ROOT = resolve(new URL("../..", import.meta.url).pathname);

/**
 * The run's own corner of the dev sandbox, never the sandbox's real home. The
 * real path is used, not the repository's `.sandbox` link: pi walks up from a
 * chat's folder for `.agents/skills`, and the link's lexical path would reach the
 * repository's own.
 */
export const TMP = join(sandboxRoot, "e2e");
export const AGENT_HOME = join(TMP, "agent");
export const USER_HOME = join(TMP, "user");
export const PROJECT = join(USER_HOME, "project");
export const PROJECT_TWO = join(USER_HOME, "project-two");
/** An empty folder the picker opens and trusts during a run. */
export const PROJECT_THREE = join(USER_HOME, "project-three");
/** A folder with project resources that no spec trusts: the refusal needs one. */
export const PROJECT_UNTRUSTED = join(USER_HOME, "project-untrusted");
/** A project with a chat and resources, kept untrusted until the gate test opens it. */
export const PROJECT_GATE = join(USER_HOME, "project-gate");
export const LOCAL_PACKAGE = join(TMP, "packages", "e2e-package");
export const SECOND_PACKAGE = join(TMP, "packages", "e2e-second-package");
/** A folder the browser uploads through the skills import flow. */
export const IMPORT_FOLDER = join(TMP, "fixtures", "import-skill");
/** A real stdio MCP server the suite starts; enabled only by the MCP live test. */
const MCP_SERVER_SCRIPT = join(REPO_ROOT, "e2e", "support", "mcp-server.ts");
const USER_SKILLS = join(USER_HOME, ".agents", "skills");
const FOREIGN_SKILLS = join(USER_HOME, ".claude", "skills");
export const SETTINGS_FILE = join(AGENT_HOME, "settings.json");
export const MODELS_FILE = join(AGENT_HOME, "models.json");
export const MCP_FILE = join(AGENT_HOME, "mcp.json");
export const PINS_FILE = join(AGENT_HOME, "pinned-sessions.json");
export const PROJECT_MCP_FILE = join(PROJECT, ".pi", "mcp.json");
export const PROJECT_SETTINGS_FILE = join(PROJECT, ".pi", "settings.json");

/** Fixed ids and times keep the run reproducible; only the files' mtimes move. */
export const CHAT_ID = "11111111-1111-4111-8111-111111111111";
export const RENAME_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_CHAT_ID = "33333333-3333-4333-8333-333333333333";
export const PROJECT_TWO_CHAT_ID = "44444444-4444-4444-8444-444444444444";
export const PROJECT_GATE_CHAT_ID = "66666666-6666-4666-8666-666666666666";
export const PINNED_ID = "55555555-5555-4555-8555-555555555555";
const CHAT_NAME = "Seeded chat";
const RENAME_NAME = "Rename me";
const PROJECT_CHAT_NAME = "Project chat";
const PROJECT_TWO_CHAT_NAME = "Second project chat";
const PROJECT_GATE_CHAT_NAME = "Gate chat";
const PINNED_NAME = "Pinned chat";

/** The provider the turn tests drive. Real endpoint, real key, no stand-in. */
const LIVE_PROVIDER = "commandcode";
const LIVE_BASE_URL = "https://api.commandcode.ai/provider/v1";
/** Fast, cheap, and reasoning-capable so the thinking picker has something to show. */
export const LIVE_MODEL = "deepseek/deepseek-v4.1-flash";
export const LIVE_MODEL_TWO = "qwen/qwen3.7-flash";
const LIVE_MODEL_NAME = "DeepSeek V4.1 Flash";
const LIVE_MODEL_TWO_NAME = "Qwen 3.7 Flash";
/** A provider whose endpoint is a closed port: the failure path needs no stand-in either. */
const DEAD_PROVIDER = "e2e-dead";
const DEAD_MODEL = "dead-model";

/** Read `COMMANDCODE_API_KEY` from the environment or the server's ignored `.env`. */
const readKey = (): string | undefined => {
	const fromEnv = process.env["COMMANDCODE_API_KEY"]?.trim();
	if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
	const file = join(REPO_ROOT, "server", ".env");
	if (!existsSync(file)) return undefined;
	for (const line of readFileSync(file, "utf8").split("\n")) {
		const match = /^\s*COMMANDCODE_API_KEY\s*=\s*(.*)\s*$/u.exec(line);
		if (match !== null) {
			const value = (match[1] ?? "").trim().replace(/^['"]|['"]$/gu, "");
			if (value !== "") return value;
		}
	}
	return undefined;
};

export const COMMANDCODE_KEY = readKey();
/** True when a real turn can run. Tests that need one skip, with that reason, when false. */
export const LIVE = COMMANDCODE_KEY !== undefined;
export const LIVE_REASON =
	"needs COMMANDCODE_API_KEY (set it in server/.env or the environment) so the real provider answers";

const STAMP = "2026-10-31T04:00:00.000Z";
const NOW = Date.parse(STAMP);

type TextPart = { type: "text"; text: string };
type ThinkingPart = { type: "thinking"; thinking: string };
type ToolCallPart = {
	type: "toolCall";
	id: string;
	name: string;
	arguments: { command: string };
};
type AssistantPart = TextPart | ThinkingPart | ToolCallPart;
type Usage = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
};

/** The pi message shapes the fixtures write; the engine reads them as the real thing. */
type FixtureMessage =
	| { role: "user"; content: TextPart[]; timestamp: number }
	| {
			role: "assistant";
			content: AssistantPart[];
			api: "openai-completions";
			provider: string;
			model: string;
			usage: Usage;
			stopReason: "stop" | "toolUse" | "error";
			errorMessage?: string;
			timestamp: number;
	  }
	| {
			role: "toolResult";
			toolCallId: string;
			toolName: string;
			content: TextPart[];
			isError: boolean;
			timestamp: number;
	  }
	| {
			role: "bashExecution";
			command: string;
			output: string;
			exitCode: number;
			cancelled: boolean;
			truncated: boolean;
			timestamp: number;
	  }
	| { role: "branchSummary"; summary: string; fromId: string | null; timestamp: number }
	| { role: "compactionSummary"; summary: string; tokensBefore: number; timestamp: number };

const userMessage = (body: string): FixtureMessage => ({
	role: "user",
	content: text(body),
	timestamp: NOW,
});

const assistantMessage = (
	content: AssistantPart[],
	stopReason: "stop" | "toolUse" | "error" = "stop",
	errorMessage?: string,
): FixtureMessage => {
	const message: FixtureMessage = {
		role: "assistant",
		content,
		api: "openai-completions",
		provider: LIVE_PROVIDER,
		model: LIVE_MODEL,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: NOW,
	};
	if (errorMessage !== undefined) message.errorMessage = errorMessage;
	return message;
};

function text(value: string): TextPart[] {
	return [{ type: "text", text: value }];
}

type MessageEntry = {
	type: "message";
	id: string;
	parentId: string | null;
	timestamp: string;
	message: FixtureMessage;
};

type SessionInfoEntry = {
	type: "session_info";
	id: string;
	parentId: string | null;
	timestamp: string;
	name: string;
};

type FixtureEntry = MessageEntry | SessionInfoEntry;

const messageEntry = (
	id: string,
	parentId: string | null,
	message: FixtureMessage,
): MessageEntry => ({ type: "message", id, parentId, timestamp: STAMP, message });

const sessionInfo = (id: string, parentId: string | null, name: string): SessionInfoEntry => ({
	type: "session_info",
	id,
	parentId,
	timestamp: STAMP,
	name,
});

/** A linear entry chain: the header names the session, every entry follows the last. */
const sessionFile = (id: string, cwd: string, entries: readonly FixtureEntry[]): string => {
	const header = { type: "session", version: 3, id, timestamp: STAMP, cwd };
	return [header, ...entries].map((entry) => JSON.stringify(entry)).join("\n") + "\n";
};

/**
 * One chat that covers every row the transcript draws: prose, a tool call with a
 * result, a shell run, a code block, thinking, a refused turn and both summaries.
 */
const chatEntries = (name: string): FixtureEntry[] => {
	const toolCall = assistantMessage(
		[
			{ type: "text", text: "I will run the fixture command." },
			{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "printf e2e" } },
		],
		"toolUse",
	);
	return [
		sessionInfo("i1", null, name),
		messageEntry("u1", "i1", userMessage("Hello from the fixture")),
		messageEntry("a1", "u1", toolCall),
		messageEntry("r1", "a1", {
			role: "toolResult",
			toolCallId: "call-1",
			toolName: "bash",
			content: text("e2e"),
			isError: false,
			timestamp: NOW,
		}),
		messageEntry("a2", "r1", assistantMessage(text("The fixture command printed **e2e**."))),
		messageEntry("b1", "a2", {
			role: "bashExecution",
			command: "printf shell",
			output: "shell",
			exitCode: 0,
			cancelled: false,
			truncated: false,
			timestamp: NOW,
		}),
		messageEntry("u2", "b1", userMessage("Show me a code block")),
		messageEntry(
			"a3",
			"u2",
			assistantMessage(text("Here it is:\n\n```ts\nconst answer = 42;\n```\n")),
		),
		messageEntry("u3", "a3", userMessage("Think first")),
		messageEntry(
			"a4",
			"u3",
			assistantMessage([
				{ type: "thinking", thinking: "The fixture weighs its answer before writing it." },
				{ type: "text", text: "A considered fixture answer." },
			]),
		),
		messageEntry("u4", "a4", userMessage("Break for me")),
		messageEntry(
			"a5",
			"u4",
			assistantMessage([], "error", "The fixture provider refused this call."),
		),
		messageEntry("s1", "a5", {
			role: "compactionSummary",
			summary: "The fixture compacted its earlier turns.",
			tokensBefore: 4096,
			timestamp: NOW,
		}),
		messageEntry("s2", "s1", {
			role: "branchSummary",
			summary: "The fixture branched from the second answer.",
			fromId: "a2",
			timestamp: NOW,
		}),
	];
};

const simpleEntries = (name: string, reply: string): FixtureEntry[] => [
	sessionInfo("i1", null, name),
	messageEntry("u1", "i1", userMessage(`Hello from ${name}`)),
	messageEntry("a1", "u1", assistantMessage(text(reply))),
];

const skillFile = (name: string, description: string, body: string, extra = ""): string =>
	`---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n${body}\n`;

const writeJson = <Value>(path: string, value: Value): Promise<void> =>
	writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const writeSession = async (
	folder: string,
	id: string,
	cwd: string,
	entries: readonly FixtureEntry[],
): Promise<void> => {
	const path = join(AGENT_HOME, "sessions", folder, `2026-10-31T04-00-00-000Z_${id}.jsonl`);
	await mkdir(join(AGENT_HOME, "sessions", folder), { recursive: true });
	await writeFile(path, sessionFile(id, cwd, entries), "utf8");
};

type FixtureModel = {
	id: string;
	name: string;
	reasoning?: boolean;
	contextWindow?: number;
	maxTokens?: number;
};

type FixtureProvider = {
	name: string;
	baseUrl: string;
	api: "openai-completions";
	apiKey: string;
	compat?: { supportsDeveloperRole?: boolean };
	models: FixtureModel[];
};

/** The seeded provider entries: the real one when a key exists, and the two failure cases. */
const providerEntries = () => {
	const base = {
		[DEAD_PROVIDER]: {
			name: "Dead Provider",
			baseUrl: "http://127.0.0.1:9/v1",
			api: "openai-completions",
			apiKey: "dead-key",
			models: [{ name: "Dead Model", id: DEAD_MODEL }],
		},
		"e2e-delete": {
			name: "Delete Provider",
			baseUrl: "http://127.0.0.1:9/delete",
			api: "openai-completions",
			apiKey: "delete-key",
			models: [{ name: "Delete Model", id: "delete-model" }],
		},
	} satisfies Record<string, FixtureProvider>;
	if (COMMANDCODE_KEY === undefined) return base;
	return {
		...base,
		[LIVE_PROVIDER]: {
			name: "CommandCode",
			baseUrl: LIVE_BASE_URL,
			api: "openai-completions",
			apiKey: COMMANDCODE_KEY,
			compat: { supportsDeveloperRole: false },
			models: [
				{
					name: LIVE_MODEL_NAME,
					id: LIVE_MODEL,
					reasoning: true,
					contextWindow: 1_000_000,
					maxTokens: 32_000,
				},
				{
					name: LIVE_MODEL_TWO_NAME,
					id: LIVE_MODEL_TWO,
					reasoning: true,
					contextWindow: 1_000_000,
					maxTokens: 32_000,
				},
			],
		},
	} satisfies Record<string, FixtureProvider>;
};

export async function seedHome(): Promise<void> {
	await rm(TMP, { recursive: true, force: true });
	await Promise.all([
		mkdir(join(AGENT_HOME, "chats"), { recursive: true }),
		mkdir(join(AGENT_HOME, "skills", "e2e-skill", "references"), { recursive: true }),
		mkdir(join(AGENT_HOME, "skills", "broken-skill"), { recursive: true }),
		mkdir(join(AGENT_HOME, "skills", "manual-skill"), { recursive: true }),
		mkdir(join(AGENT_HOME, "sessions"), { recursive: true }),
		mkdir(join(USER_SKILLS, "agents-skill"), { recursive: true }),
		mkdir(join(FOREIGN_SKILLS, "foreign-skill"), { recursive: true }),
		mkdir(join(PROJECT, ".pi", "skills", "project-skill"), { recursive: true }),
		mkdir(join(PROJECT, ".agents", "skills", "project-agents-skill"), { recursive: true }),
		mkdir(join(PROJECT_TWO, ".pi", "skills", "second-skill"), { recursive: true }),
		mkdir(join(PROJECT_UNTRUSTED, ".pi", "skills", "hidden-skill"), { recursive: true }),
		mkdir(join(PROJECT_GATE, ".pi", "skills", "gate-skill"), { recursive: true }),
		mkdir(PROJECT_THREE, { recursive: true }),
		mkdir(join(LOCAL_PACKAGE, "skills", "package-skill"), { recursive: true }),
		mkdir(join(LOCAL_PACKAGE, "prompts"), { recursive: true }),
		mkdir(join(SECOND_PACKAGE, "skills", "second-package-skill"), { recursive: true }),
		mkdir(join(IMPORT_FOLDER, "references"), { recursive: true }),
	]);

	await Promise.all([
		writeJson(MODELS_FILE, { providers: providerEntries() }),
		writeJson(join(AGENT_HOME, "auth.json"), {}),
		writeJson(SETTINGS_FILE, {
			defaultProvider: LIVE ? LIVE_PROVIDER : DEAD_PROVIDER,
			defaultModel: LIVE ? LIVE_MODEL : DEAD_MODEL,
			packages: [LOCAL_PACKAGE],
		}),
		writeJson(MCP_FILE, {
			mcpServers: {
				"e2e-disabled": {
					url: "http://127.0.0.1:9/mcp",
					enabled: false,
					description: "A disabled fixture server",
				},
				"e2e-stdio": {
					command: "cat",
					args: [],
					enabled: false,
					description: "A disabled stdio fixture",
				},
				"e2e-headers": {
					url: "https://example.com/mcp",
					enabled: false,
					description: "A header fixture",
					exposure: "codemode",
					timeout: 45,
					headers: { Authorization: "Bearer seeded-secret" },
				},
				"e2e-broken": {
					url: "not-a-url",
					description: "An invalid fixture pi skips",
				},
				"e2e-live": {
					command: "bun",
					args: [MCP_SERVER_SCRIPT],
					enabled: false,
					description: "A real stdio MCP server with one echo tool",
				},
			},
		}),
		writeJson(PINS_FILE, { sessions: [PINNED_ID] }),
		writeFile(
			join(AGENT_HOME, "skills", "e2e-skill", "SKILL.md"),
			skillFile(
				"e2e-skill",
				"A seeded skill for the end-to-end tests.",
				"# E2E skill\n\nUse the reference.",
				"license: MIT\nallowed-tools: Bash\nmetadata:\n  owner: e2e\n",
			),
			"utf8",
		),
		writeFile(
			join(AGENT_HOME, "skills", "e2e-skill", "references", "example.md"),
			"A reference file.\n",
			"utf8",
		),
		writeFile(
			join(AGENT_HOME, "skills", "broken-skill", "SKILL.md"),
			"---\nname: broken-skill\n---\n\nThis skill has no description.\n",
			"utf8",
		),
		writeFile(
			join(AGENT_HOME, "skills", "manual-skill", "SKILL.md"),
			skillFile(
				"manual-skill",
				"A skill only a person can start.",
				"# Manual skill\n\nArguments: $ARGUMENTS\n",
				"disable-model-invocation: true\nwhen_to_use: Ask for it by name.\n",
			),
			"utf8",
		),
		writeFile(
			join(USER_SKILLS, "agents-skill", "SKILL.md"),
			skillFile("agents-skill", "A skill in ~/.agents/skills.", "# Agents skill\n"),
			"utf8",
		),
		writeFile(
			join(FOREIGN_SKILLS, "foreign-skill", "SKILL.md"),
			skillFile("foreign-skill", "A skill Claude Code owns.", "# Foreign skill\n"),
			"utf8",
		),
		writeFile(
			join(PROJECT, ".pi", "skills", "project-skill", "SKILL.md"),
			skillFile("project-skill", "A skill the project owns.", "# Project skill\n"),
			"utf8",
		),
		writeFile(
			join(PROJECT, ".agents", "skills", "project-agents-skill", "SKILL.md"),
			skillFile("project-agents-skill", "A skill in the project's .agents/skills.", "# Shared\n"),
			"utf8",
		),
		writeFile(
			join(PROJECT_TWO, ".pi", "skills", "second-skill", "SKILL.md"),
			skillFile("second-skill", "A skill the second project owns.", "# Second skill\n"),
			"utf8",
		),
		writeFile(
			join(PROJECT_UNTRUSTED, ".pi", "skills", "hidden-skill", "SKILL.md"),
			skillFile("hidden-skill", "A skill behind an untrusted folder.", "# Hidden\n"),
			"utf8",
		),
		writeFile(
			join(PROJECT_GATE, ".pi", "skills", "gate-skill", "SKILL.md"),
			skillFile("gate-skill", "A skill loaded only after trust.", "# Gate skill\n"),
			"utf8",
		),
		writeJson(join(PROJECT, ".pi", "mcp.json"), {
			mcpServers: {
				"project-only": {
					command: "/usr/bin/true",
					enabled: false,
					description: "A project-only server",
				},
				"e2e-stdio": { exposure: "deferred" },
				"project-broken": {
					url: "not-a-url",
					description: "An invalid project HTTP server",
				},
				"orphan-override": { enabled: false },
			},
		}),
		writeJson(join(PROJECT, ".pi", "settings.json"), {
			extensions: ["-builtin:mcp"],
		}),
		writeFile(
			join(PROJECT, "AGENTS.md"),
			"# Project instructions\n\nThe fixture project says hello.\n",
			"utf8",
		),
		writeJson(join(LOCAL_PACKAGE, "package.json"), {
			name: "e2e-package",
			version: "0.0.1",
			keywords: ["pi-package"],
			pi: { skills: ["./skills"], prompts: ["./prompts"] },
		}),
		writeFile(
			join(LOCAL_PACKAGE, "skills", "package-skill", "SKILL.md"),
			skillFile("package-skill", "A skill shipped by the fixture package.", "# Package skill\n"),
			"utf8",
		),
		writeFile(
			join(LOCAL_PACKAGE, "prompts", "fixture.prompt.md"),
			"---\ndescription: A packaged prompt\n---\nSay the fixture word.\n",
			"utf8",
		),
		writeJson(join(SECOND_PACKAGE, "package.json"), {
			name: "e2e-second-package",
			version: "0.0.1",
			keywords: ["pi-package"],
			pi: { skills: ["./skills"] },
		}),
		writeFile(
			join(SECOND_PACKAGE, "skills", "second-package-skill", "SKILL.md"),
			skillFile(
				"second-package-skill",
				"A skill shipped by the second fixture package.",
				"# Second package skill\n",
			),
			"utf8",
		),
		writeFile(
			join(IMPORT_FOLDER, "SKILL.md"),
			skillFile("import-skill", "A skill uploaded from a folder.", "# Imported skill\n"),
			"utf8",
		),
		writeFile(join(IMPORT_FOLDER, "references", "notes.md"), "The imported reference.\n", "utf8"),
	]);

	await Promise.all([
		writeSession("chats", CHAT_ID, join(AGENT_HOME, "chats"), chatEntries(CHAT_NAME)),
		writeSession(
			"chats",
			RENAME_ID,
			join(AGENT_HOME, "chats"),
			simpleEntries(RENAME_NAME, "Rename me."),
		),
		writeSession(
			"chats",
			PINNED_ID,
			join(AGENT_HOME, "chats"),
			simpleEntries(PINNED_NAME, "Pinned."),
		),
		writeSession(
			"project",
			PROJECT_CHAT_ID,
			PROJECT,
			simpleEntries(PROJECT_CHAT_NAME, "This one runs in the project."),
		),
		writeSession(
			"project-two",
			PROJECT_TWO_CHAT_ID,
			PROJECT_TWO,
			simpleEntries(PROJECT_TWO_CHAT_NAME, "This one runs in the second project."),
		),
		writeSession(
			"project-gate",
			PROJECT_GATE_CHAT_ID,
			PROJECT_GATE,
			simpleEntries(PROJECT_GATE_CHAT_NAME, "This one runs behind the gate."),
		),
	]);
}
