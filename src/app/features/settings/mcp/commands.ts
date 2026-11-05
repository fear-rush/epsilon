/** Every write the MCP pages make, into the one socket call each belongs to. */
import type {
	McpInProjectValue,
	McpReachTool,
	McpScope,
	McpServerInput,
} from "#protocol/settings/mcp";
import { call } from "@/core/runtime";

/** The folder a page acts on: the project it names, or null for the agent home. */
type Folder = string | null | undefined;

const folderOf = (folder: Folder): string | null => folder ?? null;

export const saveMcpServer = (folder: Folder, server: McpServerInput): Promise<void> =>
	call((client) => client["settings.mcp.save"]({ folder: folderOf(folder), server }));

export const deleteMcpServer = (folder: Folder, scope: McpScope, name: string): Promise<void> =>
	call((client) => client["settings.mcp.remove"]({ folder: folderOf(folder), name, scope }));

export const setMcpServerEnabled = (
	folder: Folder,
	input: { scope: McpScope; name: string; enabled: boolean },
): Promise<void> =>
	call((client) =>
		client["settings.mcp.setEnabled"]({
			enabled: input.enabled,
			folder: folderOf(folder),
			name: input.name,
			scope: input.scope,
		}),
	);

export const setMcpServerInProject = (
	folder: Folder,
	input: { name: string; value: McpInProjectValue },
): Promise<void> =>
	call((client) =>
		client["settings.mcp.setInProject"]({
			folder: folderOf(folder),
			name: input.name,
			value: input.value,
		}),
	);

export const saveMcpRaw = (
	folder: Folder,
	scope: McpScope,
	name: string,
	text: string,
): Promise<void> =>
	call((client) =>
		client["settings.mcp.writeRaw"]({ folder: folderOf(folder), name, scope, text }),
	);

export const setMcpAutoEnableCodemode = (
	folder: Folder,
	input: { scope: McpScope; enabled: boolean },
): Promise<void> =>
	call((client) =>
		client["settings.mcp.setAutoEnableCodemode"]({
			enabled: input.enabled,
			folder: folderOf(folder),
			scope: input.scope,
		}),
	);

export const setMcpDefaultTool = (
	folder: Folder,
	input: { tool: McpReachTool; enabled: boolean },
): Promise<void> =>
	call((client) =>
		client["settings.mcp.setDefaultTool"]({
			enabled: input.enabled,
			folder: folderOf(folder),
			tool: input.tool,
		}),
	);

export const runMcpCommand = (
	folder: Folder,
	input: { action: "login" | "logout" | "reconnect"; name: string },
): Promise<{ sessionId: string }> =>
	call((client) =>
		client["settings.mcp.command"]({
			action: input.action,
			folder: folderOf(folder),
			name: input.name,
		}),
	);
