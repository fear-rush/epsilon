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
