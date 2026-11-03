import {
	createCodemodeExtension,
	createMcpExtension,
	createToolSearchExtension,
} from "@earendil-works/pi-coding-agent";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";

/**
 * The CLI's built-in extensions, registered the way the CLI registers them
 * (`dist/extensions/index.js`): `builtin` makes each a toggleable resource, and
 * `replaceable` lets an operator extension with the same command or tool name take over.
 *
 * The SDK does not load these on its own, so an engine without them is quieter than
 * `pi` in a terminal: no codemode, no deferred `tool_search`, and no MCP servers at all.
 * Epsilon's own defaults (permission, discuss) land with the features that need them.
 */
export const builtinExtensions = (): InlineExtension[] => [
	{ name: "codemode", factory: createCodemodeExtension(), replaceable: true, builtin: true },
	{ name: "tool-search", factory: createToolSearchExtension(), replaceable: true, builtin: true },
	{ name: "mcp", factory: createMcpExtension(), replaceable: true, builtin: true },
];
