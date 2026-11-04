import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { ProjectNotTrusted, ProjectRefused, SkillRefused } from "../errors.ts";
import { ContextUsage } from "../usage.ts";
import { SkillView } from "./skills.ts";

/**
 * The context page: everything pi loads for a folder before the model answers.
 *
 * Every field is something pi decided, so the page shows pi's answer instead of
 * guessing what a file does. The file-side fields answer with no chat open; the exact
 * prompt, the tool set and the token usage belong to a live engine and are merged only
 * where one is open, with `live` saying which answer is shown.
 */

export const ContextOrigin = Schema.Literals([
	"home",
	"project",
	"settings-path",
	"package",
	"extension",
]);
export type ContextOrigin = typeof ContextOrigin.Type;

export const ContextPrompt = Schema.Struct({
	name: Schema.String,
	description: Schema.String,
	/** pi's own `argument-hint`, shown after the name in a palette. */
	argumentHint: Schema.optional(Schema.String),
	path: Schema.String,
	origin: ContextOrigin,
	/** False when a settings filter or package toggle turned it off. */
	enabled: Schema.Boolean,
});
export type ContextPrompt = typeof ContextPrompt.Type;

export const ContextExtension = Schema.Struct({
	/** The file, or pi's synthetic `builtin:<name>` path. */
	path: Schema.String,
	/** The file's own name, or the built-in's. */
	name: Schema.String,
	origin: ContextOrigin,
	enabled: Schema.Boolean,
	/** pi's load errors for this extension. Empty until a chat is open. */
	errors: Schema.Array(Schema.String),
	/** pi's load warnings for this extension. Empty until a chat is open. */
	warnings: Schema.Array(Schema.String),
});
export type ContextExtension = typeof ContextExtension.Type;

/** What one declared package contributes, counted from pi's resolver. */
export const ContextPackage = Schema.Struct({
	source: Schema.String,
	scope: Schema.Literals(["user", "project"]),
	resources: Schema.Struct({
		extensions: Schema.Finite,
		skills: Schema.Finite,
		prompts: Schema.Finite,
		themes: Schema.Finite,
	}),
});
export type ContextPackage = typeof ContextPackage.Type;

/** One tool pi offers the model, and whether pi made it active. */
export const ContextTool = Schema.Struct({
	name: Schema.String,
	description: Schema.String,
	/** pi's group for a tool an extension or MCP server registered. */
	namespace: Schema.optional(Schema.String),
});
export type ContextTool = typeof ContextTool.Type;

/** Something pi reported that the operator should see on the page, not in silence. */
export const ContextProblem = Schema.Struct({
	kind: Schema.Literals(["settings", "skill", "prompt", "extension"]),
	message: Schema.String,
	path: Schema.optional(Schema.String),
});
export type ContextProblem = typeof ContextProblem.Type;

export const ContextSystemPrompt = Schema.Struct({
	/** Which file pi uses, or the built-in prompt when there is none. */
	source: Schema.Literals(["project", "agent", "default"]),
	/** The `SYSTEM.md` that replaces pi's prompt, when one exists. */
	replacePath: Schema.optional(Schema.String),
	/** The `APPEND_SYSTEM.md` files pi appends. */
	appendPaths: Schema.Array(Schema.String),
	/** pi's prompt exactly as the model receives it, when a chat is open. */
	text: Schema.optional(Schema.String),
});
export type ContextSystemPrompt = typeof ContextSystemPrompt.Type;

export const ContextView = Schema.Struct({
	/** The folder the answer is about: a trusted project, or the home alone. */
	folder: Schema.String,
	/** The project folder, or null when the answer is the agent home alone. */
	project: Schema.NullOr(Schema.String),
	/**
	 * A chat is open in this folder, so `systemPrompt.text`, `tools` and
	 * `contextUsage` are filled from it.
	 */
	live: Schema.Boolean,
	/** The chat the live fields were read from, when the folder has one open. */
	liveSessionId: Schema.optional(Schema.String),
	/** Every `AGENTS.md`/`CLAUDE.md` pi loads, in the order pi applies them. */
	contextFiles: Schema.Array(
		Schema.Struct({
			path: Schema.String,
			/** The folder the file came from, which is what a reader scans. */
			directory: Schema.String,
			/** pi's order, from the agent home down to the working folder. */
			order: Schema.Finite,
		}),
	),
	systemPrompt: ContextSystemPrompt,
	skills: Schema.Array(SkillView),
	prompts: Schema.Array(ContextPrompt),
	extensions: Schema.Array(ContextExtension),
	packages: Schema.Array(ContextPackage),
	/** Every tool pi offers, and the active set, when a chat is open. */
	tools: Schema.optional(
		Schema.Struct({
			active: Schema.Array(Schema.String),
			all: Schema.Array(ContextTool),
		}),
	),
	contextUsage: Schema.optional(ContextUsage),
	problems: Schema.Array(ContextProblem),
});
export type ContextView = typeof ContextView.Type;

/** What one engine answers to the `contextLive` query. */
export const ContextEngineLive = Schema.Struct({
	sessionId: Schema.String,
	systemPrompt: Schema.String,
	tools: Schema.Struct({
		active: Schema.Array(Schema.String),
		all: Schema.Array(ContextTool),
	}),
	contextUsage: Schema.optional(ContextUsage),
});
export type ContextEngineLive = typeof ContextEngineLive.Type;

export const ContextRpcs = RpcGroup.make(
	Rpc.make("settings.context.read", {
		payload: { folder: Schema.NullOr(Schema.String) },
		success: ContextView,
		error: Schema.Union([ProjectNotTrusted, ProjectRefused, SkillRefused]),
	}),
);
