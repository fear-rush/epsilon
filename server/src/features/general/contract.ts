/** The default-model shape the route and the settings snapshot share. */
import { z } from "@hono/zod-openapi";

export const defaultModelSchema = z
	.object({
		provider: z.string(),
		modelId: z.string(),
	})
	.openapi("DefaultModel");

export type DefaultModel = z.infer<typeof defaultModelSchema>;

/**
 * The agent-wide limits that decide when pi summarises and how it retries.
 *
 * pi only exposes setters for the two booleans and the model scope, so the three
 * numbers are merged into `settings.json` by Epsilon (docs/DECISIONS.md, Configure
 * in the dashboard). They are global: a project's `.pi/settings.json` can still
 * override them, and this panel never writes that file.
 */
export const agentLimitsSchema = z
	.object({
		/** Compact automatically when the context nears the window. */
		compactionEnabled: z.boolean(),
		/** Free tokens kept below the window before compaction starts. */
		compactionReserveTokens: z.number().int().min(0),
		/** Recent tokens kept without summarising. */
		compactionKeepRecentTokens: z.number().int().min(0),
		/** Retry after a transient provider failure. */
		retryEnabled: z.boolean(),
		/** Attempts pi makes after the first one. */
		retryMaxRetries: z.number().int().min(0),
		/** pi's scope patterns, or null when every model is offered. */
		enabledModels: z.array(z.string().min(1)).nullable(),
	})
	.openapi("AgentLimits");

export type AgentLimits = z.infer<typeof agentLimitsSchema>;

/**
 * Which layer supplies a setting: a project's `.pi/settings.json`, the home's
 * `settings.json`, or pi's built-in default when neither file sets it. Two keys
 * are read from the home's file alone, so a project value for those supplies
 * nothing and the scope stays `global` or `default`.
 */
const settingScopeSchema = z.enum(["project", "global", "default"]).openapi("SettingScope");

/**
 * One `settings.json` key as the panel needs it. A value is always one of JSON's
 * own shapes, which is what pi stored; the client narrows it per control.
 */
export const settingViewSchema = z
	.object({
		/** pi's own key path in `settings.json`, such as "compaction.reserveTokens". */
		key: z.string(),
		/** What pi resolves, or null when pi refused the value; `error` then says why. */
		value: z.union([
			z.string(),
			z.number(),
			z.boolean(),
			z.null(),
			z.array(z.string()),
			z.record(z.string(), z.unknown()),
		]),
		scope: settingScopeSchema,
		/** The browser cannot apply it; the panel lists it read-only with the reason. */
		terminalOnly: z.boolean(),
		/** pi's own sentence for a value it refuses. */
		error: z.string().optional(),
	})
	.openapi("SettingView");

export type SettingScope = z.infer<typeof settingScopeSchema>;
export type SettingView = z.infer<typeof settingViewSchema>;
