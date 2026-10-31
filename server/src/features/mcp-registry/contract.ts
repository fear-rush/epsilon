/** The registry browser's shapes and its two routes. The handlers are in `routes.ts`. */
import { createRoute, z } from "@hono/zod-openapi";

import { errorContent } from "../../platform/http";

const registrySourceSchema = z.enum(["official", "github"]).openapi("McpRegistrySource");

export type RegistrySource = z.infer<typeof registrySourceSchema>;

const searchItemSchema = z
	.object({
		source: registrySourceSchema,
		/** The registry's own name, such as `io.github.owner/server`. */
		name: z.string(),
		title: z.string(),
		description: z.string(),
		version: z.string(),
		repositoryUrl: z.string().optional(),
		/** Package types and `remote`, so a row says how the server runs. */
		kinds: z.array(z.string()),
	})
	.openapi("McpRegistryItem");

export type RegistryItem = z.infer<typeof searchItemSchema>;

const searchResultSchema = z
	.object({ items: z.array(searchItemSchema), nextCursor: z.string().optional() })
	.openapi("McpRegistrySearch");

export type RegistrySearch = z.infer<typeof searchResultSchema>;

/** A value the person supplies before the entry is complete. */
const inputSchema = z
	.object({
		/** The placeholder in the entry is `{key}`. */
		key: z.string(),
		target: z.enum(["env", "header", "arg", "url"]),
		name: z.string(),
		description: z.string().optional(),
		required: z.boolean(),
		secret: z.boolean(),
		default: z.string().optional(),
		choices: z.array(z.string()).optional(),
	})
	.openapi("McpRegistryInput");

export type RegistryInput = z.infer<typeof inputSchema>;

/** The write route's server entry, without name and scope. */
const entrySchema = z
	.discriminatedUnion("transport", [
		z.object({
			transport: z.literal("stdio"),
			command: z.string(),
			args: z.array(z.string()),
			env: z.record(z.string(), z.string()),
		}),
		z.object({
			transport: z.literal("http"),
			url: z.string(),
			headers: z.record(z.string(), z.string()),
		}),
	])
	.openapi("McpRegistryEntry");

export type RegistryEntry = z.infer<typeof entrySchema>;

const optionSchema = z
	.object({
		id: z.string(),
		label: z.string(),
		supported: z.boolean(),
		/** Why the option cannot be installed; set when `supported` is false. */
		reason: z.string().optional(),
		entry: entrySchema.optional(),
		inputs: z.array(inputSchema),
	})
	.openapi("McpRegistryOption");

export type InstallOption = z.infer<typeof optionSchema>;

const detailSchema = z
	.object({
		name: z.string(),
		title: z.string(),
		description: z.string(),
		repositoryUrl: z.string().optional(),
		options: z.array(optionSchema),
		/** One line about what the data lacks, when it came from a partial source. */
		note: z.string().optional(),
	})
	.openapi("McpRegistryDetail");

export type RegistryDetail = z.infer<typeof detailSchema>;

const searchQuerySchema = z.object({
	source: registrySourceSchema,
	q: z.string().optional(),
	cursor: z.string().optional(),
});

const detailQuerySchema = z.object({ source: registrySourceSchema, name: z.string().min(1) });

export const searchRegistryRoute = createRoute({
	method: "get",
	path: "/api/settings/mcp/registry/search",
	tags: ["settings"],
	operationId: "searchMcpRegistry",
	description: "Search or browse the MCP server registry, twenty servers a page",
	request: { query: searchQuerySchema },
	responses: {
		200: {
			description: "A page of servers and the cursor of the next one",
			content: { "application/json": { schema: searchResultSchema } },
		},
		502: { description: "The registry did not answer", content: errorContent },
	},
});

export const readRegistryServerRoute = createRoute({
	method: "get",
	path: "/api/settings/mcp/registry/server",
	tags: ["settings"],
	operationId: "readMcpRegistryServer",
	description: "One registry server with the ways to install it, as mcp.json entries",
	request: { query: detailQuerySchema },
	responses: {
		200: {
			description: "The server and its install options",
			content: { "application/json": { schema: detailSchema } },
		},
		404: { description: "The registry has no server of this name", content: errorContent },
		502: { description: "The registry did not answer", content: errorContent },
	},
});
