import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { RegistryNotFound, RegistryUnavailable } from "../errors.ts";

/**
 * Settings → MCP → Registry: the public server catalogs, read on demand.
 *
 * Nothing is stored. A search asks the registry again, and a detail turns one registry
 * entry into the `mcp.json` entries it could become, with a `{key}` placeholder wherever
 * the operator has to supply a value. The panel fills those placeholders and saves the
 * result through `config.mcp.save`, so the registry never writes a file.
 */

/** The two public catalogs the old panel offered. */
export const McpRegistrySource = Schema.Literals(["official", "github"]);
export type McpRegistrySource = typeof McpRegistrySource.Type;

/** Where a placeholder lives in an install option's entry. */
export const McpRegistryTarget = Schema.Literals(["env", "header", "arg", "url"]);
export type McpRegistryTarget = typeof McpRegistryTarget.Type;

export const McpRegistryItem = Schema.Struct({
	source: McpRegistrySource,
	/** The registry's own name, such as `io.github.owner/server`. */
	name: Schema.String,
	title: Schema.String,
	description: Schema.String,
	version: Schema.String,
	repositoryUrl: Schema.optional(Schema.String),
	/** Package types and `remote`, so a row says how the server runs. */
	kinds: Schema.Array(Schema.String),
});
export type McpRegistryItem = typeof McpRegistryItem.Type;

export const McpRegistrySearch = Schema.Struct({
	items: Schema.Array(McpRegistryItem),
	nextCursor: Schema.optional(Schema.String),
});
export type McpRegistrySearch = typeof McpRegistrySearch.Type;

/** A value the person supplies before the entry is complete; the entry holds `{key}`. */
export const McpRegistryInput = Schema.Struct({
	key: Schema.String,
	target: McpRegistryTarget,
	name: Schema.String,
	description: Schema.optional(Schema.String),
	required: Schema.Boolean,
	secret: Schema.Boolean,
	default: Schema.optional(Schema.String),
	choices: Schema.optional(Schema.Array(Schema.String)),
});
export type McpRegistryInput = typeof McpRegistryInput.Type;

/** One `mcp.json` target, before the name, scope and the person's values are added. */
export const McpRegistryEntry = Schema.Union([
	Schema.Struct({
		transport: Schema.Literal("stdio"),
		command: Schema.String,
		args: Schema.Array(Schema.String),
		env: Schema.Record(Schema.String, Schema.String),
	}),
	Schema.Struct({
		transport: Schema.Literal("http"),
		url: Schema.String,
		headers: Schema.Record(Schema.String, Schema.String),
	}),
]);
export type McpRegistryEntry = typeof McpRegistryEntry.Type;

export const McpRegistryOption = Schema.Struct({
	id: Schema.String,
	label: Schema.String,
	supported: Schema.Boolean,
	/** Why the option cannot be installed; set when `supported` is false. */
	reason: Schema.optional(Schema.String),
	entry: Schema.optional(McpRegistryEntry),
	inputs: Schema.Array(McpRegistryInput),
});
export type McpRegistryOption = typeof McpRegistryOption.Type;

export const McpRegistryDetail = Schema.Struct({
	name: Schema.String,
	title: Schema.String,
	description: Schema.String,
	repositoryUrl: Schema.optional(Schema.String),
	options: Schema.Array(McpRegistryOption),
	/** One line about what the data lacks, when it came from a partial source. */
	note: Schema.optional(Schema.String),
});
export type McpRegistryDetail = typeof McpRegistryDetail.Type;

export const McpRegistryRpcs = RpcGroup.make(
	Rpc.make("config.mcpRegistry.search", {
		payload: {
			source: McpRegistrySource,
			q: Schema.optional(Schema.String),
			cursor: Schema.optional(Schema.String),
		},
		success: McpRegistrySearch,
		error: RegistryUnavailable,
	}),
	Rpc.make("config.mcpRegistry.read", {
		payload: {
			source: McpRegistrySource,
			name: Schema.String,
		},
		success: McpRegistryDetail,
		error: Schema.Union([RegistryUnavailable, RegistryNotFound]),
	}),
);
