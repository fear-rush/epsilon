/**
 * The context contract: what steers the model in one folder, read-only. Every
 * field is something pi decided, so the panel shows pi's answer instead of
 * guessing what a file does.
 */
import { createRoute, z } from "@hono/zod-openapi";
import { contextUsageSchema } from "shared";

import { errorContent } from "../../platform/http";
import { settingsScopeQuerySchema } from "../projects";
import { skillViewSchema } from "../skills";

/**
 * Where pi found a prompt template or an extension. The words match the skills
 * inventory, so a reader who knows one section reads the others.
 */
const resourceOriginSchema = z
	.enum(["home", "project", "settings-path", "package", "extension"])
	.openapi("ContextResourceOrigin");

/**
 * One prompt template a `/name` can expand. pi derives the name from the file and
 * the description from the frontmatter, falling back to the body's first line.
 */
const promptViewSchema = z
	.object({
		name: z.string(),
		description: z.string(),
		/** pi's own `argument-hint`, shown after the name in a palette. */
		argumentHint: z.string().optional(),
		path: z.string(),
		origin: resourceOriginSchema,
		/** False when a settings filter or package toggle turned it off. */
		enabled: z.boolean(),
	})
	.openapi("ContextPrompt");

const extensionViewSchema = z
	.object({
		/** The file, or pi's synthetic `builtin:<name>` path. */
		path: z.string(),
		/** The file's own name, or the built-in's. */
		name: z.string(),
		origin: resourceOriginSchema,
		enabled: z.boolean(),
		/** pi's load errors for this extension. Empty until a chat is open. */
		errors: z.array(z.string()),
		/** pi's load warnings for this extension. Empty until a chat is open. */
		warnings: z.array(z.string()),
	})
	.openapi("ContextExtension");

/** What one declared package contributes, counted from pi's resolver. */
const packageContextSchema = z
	.object({
		source: z.string(),
		scope: z.enum(["user", "project"]),
		resources: z
			.object({
				extensions: z.number().int(),
				skills: z.number().int(),
				prompts: z.number().int(),
				themes: z.number().int(),
			})
			.openapi("ContextPackageResources"),
	})
	.openapi("ContextPackage");

/** One tool pi offers the model, and whether pi made it active. */
const contextToolSchema = z
	.object({
		name: z.string(),
		description: z.string(),
		/** pi's group for a tool an extension or MCP server registered. */
		namespace: z.string().optional(),
	})
	.openapi("ContextTool");

/** Something pi reported that the operator should see on the page, not in silence. */
const contextProblemSchema = z
	.object({
		kind: z.enum(["settings", "skill", "prompt", "extension"]),
		message: z.string(),
		path: z.string().optional(),
	})
	.openapi("ContextProblem");

const contextViewSchema = z
	.object({
		/** The folder the answer is about: a trusted project, or the chats folder. */
		folder: z.string(),
		/** The project folder, or null when the answer is the agent home alone. */
		project: z.string().nullable(),
		/**
		 * A chat is open in this folder, so the fields below that only a live engine
		 * can answer (`systemPrompt.text`, `tools`, `contextUsage`, an extension's
		 * errors) are filled. False is a normal answer, not an error.
		 */
		live: z.boolean(),
		/** The chat the live fields were read from, when the folder has one open. */
		liveSessionId: z.string().optional(),
		/** Every `AGENTS.md`/`CLAUDE.md` pi loads, in the order pi applies them. */
		contextFiles: z.array(
			z.object({
				path: z.string(),
				/** The folder the file came from, which is what a reader scans. */
				directory: z.string(),
				/** pi's order, from the agent home down to the working folder. */
				order: z.number().int(),
			}),
		),
		systemPrompt: z
			.object({
				/** Which file pi uses, or the built-in prompt when there is none. */
				source: z.enum(["project", "agent", "default"]),
				/** The `SYSTEM.md` that replaces pi's prompt, when one exists. */
				replacePath: z.string().optional(),
				/** The `APPEND_SYSTEM.md` files pi appends. */
				appendPaths: z.array(z.string()),
				/** pi's prompt exactly as the model receives it, when a chat is open. */
				text: z.string().optional(),
			})
			.openapi("ContextSystemPrompt"),
		skills: z.array(skillViewSchema),
		prompts: z.array(promptViewSchema),
		extensions: z.array(extensionViewSchema),
		packages: z.array(packageContextSchema),
		/** Every tool pi offers, and the active set, when a chat is open. */
		tools: z
			.object({
				active: z.array(z.string()),
				all: z.array(contextToolSchema),
			})
			.optional(),
		/** How much of the model's window the chat holds, when pi reports a number. */
		contextUsage: contextUsageSchema.optional(),
		problems: z.array(contextProblemSchema),
	})
	.openapi("ContextView");

export type ContextView = z.infer<typeof contextViewSchema>;

export type ContextPrompt = z.infer<typeof promptViewSchema>;
export type ContextPackage = z.infer<typeof packageContextSchema>;
export type ContextExtension = z.infer<typeof extensionViewSchema>;
export type ContextProblem = z.infer<typeof contextProblemSchema>;

export const readContextRoute = createRoute({
	method: "get",
	path: "/api/context",
	tags: ["context"],
	operationId: "readContext",
	description:
		"Everything pi loads for a folder before the model answers: context files, the system prompt source, skills, prompt templates, extensions and packages, plus the live prompt and tools when a chat is open",
	request: { query: settingsScopeQuerySchema },
	responses: {
		200: {
			description: "What steers the model in this folder, as pi resolves it now",
			content: { "application/json": { schema: contextViewSchema } },
		},
		400: { description: "The folder could not be read", content: errorContent },
	},
});
