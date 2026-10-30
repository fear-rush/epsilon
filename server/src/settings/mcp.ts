/**
 * MCP servers live in two files: the agent home's `mcp.json` and this
 * deployment's `<project>/.pi/mcp.json`. This is the one module the rest of the
 * server imports; the listing is in `mcp-list.ts`, the writes in `mcp-write.ts`,
 * the entry rules in `mcp-entry.ts` and the document access in `mcp-file.ts`.
 *
 * pi reads the project file because the embedded engine starts trusted
 * (docs/reference/pi-sdk.md), and a project entry replaces or overrides a global
 * one of its name. Settings shows both, as pi resolves them.
 */
export { isMcpTurnedOff } from "./mcp-builtin";
export { listMcpServers, readMcpServer } from "./mcp-list";
export {
	removeMcpServer,
	setMcpServerEnabled,
	setMcpServerInProject,
	writeMcpServer,
} from "./mcp-write";
