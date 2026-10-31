/**
 * The end-to-end run's own agent home. Everything the app reads is written here,
 * never in `~/.pi`: a provider that is never called, one disabled MCP server, a
 * skill with a reference, a local package, foreign skills, and three sessions.
 * The project is seeded untrusted, so the trust flow itself is under test.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TMP = join(tmpdir(), "epsilon-e2e");
export const AGENT_HOME = join(TMP, "agent");
export const USER_HOME = join(TMP, "user");
export const PROJECT = join(USER_HOME, "project");
export const PROJECT_TWO = join(USER_HOME, "project-two");
export const LOCAL_PACKAGE = join(TMP, "packages", "e2e-package");

/** Fixed ids and times keep the run reproducible; only the files' mtimes move. */
export const CHAT_ID = "11111111-1111-4111-8111-111111111111";
export const DELETE_ID = "22222222-2222-4222-8222-222222222222";
export const PROJECT_CHAT_ID = "33333333-3333-4333-8333-333333333333";
export const PROJECT_TWO_CHAT_ID = "44444444-4444-4444-8444-444444444444";
const CHAT_NAME = "Seeded chat";
const DELETE_NAME = "Delete me";
const PROJECT_CHAT_NAME = "Project chat";
const PROJECT_TWO_CHAT_NAME = "Second project chat";

const STAMP = "2026-10-31T04:00:00.000Z";
const NOW = Date.parse(STAMP);

type TextPart = { type: "text"; text: string };
type ToolCallPart = {
	type: "toolCall";
	id: string;
	name: string;
	arguments: { command: string };
};
type AssistantPart = TextPart | ToolCallPart;
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
			stopReason: "stop" | "toolUse";
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
	  };

const userMessage = (body: string): FixtureMessage => ({
	role: "user",
	content: text(body),
	timestamp: NOW,
});

const assistantMessage = (
	content: AssistantPart[],
	stopReason: "stop" | "toolUse" = "stop",
): FixtureMessage => ({
	role: "assistant",
	content,
	api: "openai-completions",
	provider: "e2e",
	model: "e2e-model",
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
});

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
	];
};

const simpleEntries = (name: string, reply: string): FixtureEntry[] => [
	sessionInfo("i1", null, name),
	messageEntry("u1", "i1", userMessage(`Hello from ${name}`)),
	messageEntry("a1", "u1", assistantMessage(text(reply))),
];

const skillFile = (name: string, description: string, body: string): string =>
	`---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;

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

export async function seedHome(): Promise<void> {
	await rm(TMP, { recursive: true, force: true });
	const chatsDir = join(AGENT_HOME, "chats");
	await Promise.all([
		mkdir(chatsDir, { recursive: true }),
		mkdir(join(AGENT_HOME, "skills", "e2e-skill", "references"), { recursive: true }),
		mkdir(join(AGENT_HOME, "skills", "broken-skill"), { recursive: true }),
		mkdir(join(PROJECT_TWO, ".pi", "skills", "second-skill"), { recursive: true }),
		mkdir(join(AGENT_HOME, "sessions"), { recursive: true }),
		mkdir(join(USER_HOME, ".claude", "skills", "foreign-skill"), { recursive: true }),
		mkdir(join(PROJECT, ".pi", "skills", "project-skill"), { recursive: true }),
		mkdir(join(LOCAL_PACKAGE, "skills", "package-skill"), { recursive: true }),
	]);

	await Promise.all([
		writeJson(join(AGENT_HOME, "models.json"), {
			providers: {
				"e2e-delete": {
					name: "Delete Provider",
					baseUrl: "http://127.0.0.1:9/delete",
					api: "openai-completions",
					apiKey: "delete-key",
					models: [{ name: "Delete Model", id: "delete-model" }],
				},
				e2e: {
					name: "E2E Provider",
					baseUrl: "http://127.0.0.1:9/v1",
					api: "openai-completions",
					apiKey: "e2e-key",
					models: [
						{ name: "E2E Model", id: "e2e-model" },
						{ name: "E2E Small", id: "e2e-small" },
					],
				},
			},
		}),
		writeJson(join(AGENT_HOME, "auth.json"), {}),
		writeJson(join(AGENT_HOME, "settings.json"), {
			defaultProvider: "e2e",
			defaultModel: "e2e-model",
			packages: [LOCAL_PACKAGE],
		}),
		writeJson(join(AGENT_HOME, "mcp.json"), {
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
			},
		}),
		writeJson(join(AGENT_HOME, "pinned-sessions.json"), { sessions: [CHAT_ID] }),
		writeFile(
			join(AGENT_HOME, "skills", "e2e-skill", "SKILL.md"),
			skillFile(
				"e2e-skill",
				"A seeded skill for the end-to-end tests.",
				"# E2E skill\n\nUse the reference.",
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
			join(USER_HOME, ".claude", "skills", "foreign-skill", "SKILL.md"),
			skillFile("foreign-skill", "A skill Claude Code owns.", "# Foreign skill\n"),
			"utf8",
		),
		writeFile(
			join(PROJECT, ".pi", "skills", "project-skill", "SKILL.md"),
			skillFile("project-skill", "A skill the project owns.", "# Project skill\n"),
			"utf8",
		),
		writeFile(
			join(PROJECT_TWO, ".pi", "skills", "second-skill", "SKILL.md"),
			skillFile("second-skill", "A skill the second project owns.", "# Second skill\n"),
			"utf8",
		),
		writeJson(join(PROJECT, ".pi", "mcp.json"), {
			mcpServers: {
				"project-disabled": {
					url: "http://127.0.0.1:9/project",
					enabled: false,
					description: "A disabled project server",
				},
			},
		}),
		writeJson(join(LOCAL_PACKAGE, "package.json"), {
			name: "e2e-package",
			version: "0.0.1",
			keywords: ["pi-package"],
			pi: { skills: ["./skills"] },
		}),
		writeFile(
			join(LOCAL_PACKAGE, "skills", "package-skill", "SKILL.md"),
			skillFile("package-skill", "A skill shipped by the fixture package.", "# Package skill\n"),
			"utf8",
		),
	]);

	await Promise.all([
		writeSession("chats", CHAT_ID, chatsDir, chatEntries(CHAT_NAME)),
		writeSession("chats", DELETE_ID, chatsDir, simpleEntries(DELETE_NAME, "This one is deleted.")),
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
	]);
}

export { PROJECT_CHAT_NAME };
