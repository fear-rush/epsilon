/**
 * The MCP rules the browser form and the server both run: the closed value sets
 * and the name pattern. Request and response shapes live in the server's
 * contract, which composes these.
 */
import { z } from "zod";

export const mcpTransportSchema = z.enum(["stdio", "http"]);

export type McpTransport = z.infer<typeof mcpTransportSchema>;

/** The file a server lives in: `<agent home>/mcp.json` or `<project>/.pi/mcp.json`. */
export const mcpScopeSchema = z.enum(["global", "project"]);

export type McpScope = z.infer<typeof mcpScopeSchema>;

/** How a server's tools reach the model (pi's `exposure`). */
export const mcpExposureSchema = z.enum(["codemode", "deferred", "direct", "hidden"]);

export type McpExposure = z.infer<typeof mcpExposureSchema>;

/** What a project entry may change of the global server of its name. */
export const mcpOverrideKeySchema = z.enum(["enabled", "exposure", "toolExposure"]);

export type McpOverrideKey = z.infer<typeof mcpOverrideKeySchema>;

/** The key under `mcpServers`, and the URL segment. */
export const mcpNameSchema = z
	.string()
	.min(1)
	.regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, dashes and underscores");

/**
 * How a global server and the project entry of its name relate. The global side
 * is `replaced-by-project` (the project defines its own server) or
 * `overridden-by-project` (the project changes some keys); the project side of a
 * replacement is `replaces-global`.
 */
export const mcpRelationSchema = z.enum([
	"replaces-global",
	"replaced-by-project",
	"overridden-by-project",
]);

export type McpRelation = z.infer<typeof mcpRelationSchema>;
