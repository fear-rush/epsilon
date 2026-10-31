/**
 * The agent home as a value: the directory pi owns and every file inside it that
 * this server reads or writes. Chosen once in `main.ts` and passed down, so no
 * module composes a pi path from a bare string (AGENTS.md, Invariants).
 */
import { join } from "node:path";

export type AgentHome = {
	readonly dir: string;
	/** Credentials. Only `ModelRuntime.login()` and `logout()` write it. */
	readonly authFile: string;
	readonly modelsFile: string;
	readonly mcpFile: string;
	/** MCP OAuth tokens, written by pi's sign-in. */
	readonly mcpAuthFile: string;
	/** The messages MCP servers send with `notifications/message`, rotated by pi. */
	readonly mcpLogFile: string;
	/** The previous `mcp.log`, kept until the next rotation overwrites it. */
	readonly mcpLogRotatedFile: string;
	readonly skillsDir: string;
	/** Epsilon's pinned chat ids. pi has no pin concept, so this file is ours. */
	readonly pinsFile: string;
	/**
	 * Deleted chats waiting to be restored: one file per chat plus a sidecar naming
	 * where it came from. Beside `sessions/`, never inside it, because pi lists every
	 * folder under `sessions/` as a live session.
	 */
	readonly trashDir: string;
	/**
	 * The one folder every chat runs in. It holds no `.pi`, so a chat sees only the
	 * home's resources, and pi groups every chat under one session directory.
	 */
	readonly chatsDir: string;
	/** `<~>/.agents/skills`, the global folder pi and other agents share. Unknown in tests. */
	readonly userAgentsSkillsDir: string | undefined;
	/**
	 * Under `bun run dev`, the sandbox's `~`: every project folder must be inside it,
	 * so nothing from the operator's real disk reaches the sandbox. Unset on a host.
	 */
	readonly projectsRoot: string | undefined;
};

export type AgentHomeOptions = {
	/** The `~` pi resolves for this process. */
	userHome?: string;
	/** Confine projects to this folder (the dev sandbox). */
	projectsRoot?: string;
};

export const agentHome = (dir: string, options: AgentHomeOptions = {}): AgentHome => ({
	dir,
	userAgentsSkillsDir:
		options.userHome === undefined ? undefined : join(options.userHome, ".agents", "skills"),
	projectsRoot: options.projectsRoot,
	authFile: join(dir, "auth.json"),
	modelsFile: join(dir, "models.json"),
	mcpFile: join(dir, "mcp.json"),
	mcpAuthFile: join(dir, "mcp-auth.json"),
	mcpLogFile: join(dir, "mcp.log"),
	mcpLogRotatedFile: join(dir, "mcp.log.1"),
	skillsDir: join(dir, "skills"),
	pinsFile: join(dir, "pinned-sessions.json"),
	trashDir: join(dir, "trash"),
	chatsDir: join(dir, "chats"),
});

/** The MCP file pi loads for a project, beside the code it belongs to. */
export const projectMcpFile = (projectDir: string): string => join(projectDir, ".pi", "mcp.json");

/** The skills directory pi scans in a trusted project. */
export const projectSkillsDir = (projectDir: string): string => join(projectDir, ".pi", "skills");

/** The `.agents/skills` directory pi scans in a trusted project, beside `.pi`. */
export const projectAgentsSkillsDir = (projectDir: string): string =>
	join(projectDir, ".agents", "skills");
