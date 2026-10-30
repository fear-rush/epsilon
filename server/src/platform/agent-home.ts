/**
 * The agent home as a value: the directory pi owns and every file inside it that
 * this server reads or writes. Chosen once in `main.ts` and passed down, so no
 * module composes a pi path from a bare string (AGENTS.md rule 9).
 */
import { join } from "node:path";

export type AgentHome = {
	readonly dir: string;
	/** Credentials. Only `ModelRuntime.login()` and `logout()` write it. */
	readonly authFile: string;
	readonly modelsFile: string;
	readonly mcpFile: string;
	readonly skillsDir: string;
};

export const agentHome = (dir: string): AgentHome => ({
	dir,
	authFile: join(dir, "auth.json"),
	modelsFile: join(dir, "models.json"),
	mcpFile: join(dir, "mcp.json"),
	skillsDir: join(dir, "skills"),
});

/** The MCP file pi loads for a project, beside the code it belongs to. */
export const projectMcpFile = (projectDir: string): string => join(projectDir, ".pi", "mcp.json");
