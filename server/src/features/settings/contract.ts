/**
 * The dashboard configuration snapshot. The server writes pi's documented files
 * and calls pi's SDK where it exposes a writer; the browser only ever sees this
 * shape (docs/DECISIONS.md, Configure in the dashboard).
 */
import { z } from "@hono/zod-openapi";

import { defaultModelSchema } from "../general";
import { mcpLiveSchema, mcpReachSchema, mcpServerViewSchema } from "../mcp";
import { packageViewSchema } from "../packages";
import { projectStatusSchema } from "../projects";
import { builtinProviderSchema, catalogModelSchema, providerViewSchema } from "../providers";
import { foreignSkillViewSchema, skillViewSchema } from "../skills";

export const settingsSnapshotSchema = z
	.object({
		home: z.string(),
		defaultModel: defaultModelSchema.nullable(),
		/** Providers with an entry or a credential. The full registry is in builtins. */
		providers: z.array(providerViewSchema),
		/** Every provider pi ships, for the add picker. */
		builtins: z.array(builtinProviderSchema),
		/** Every model the engine accepts, for the default-model picker. */
		models: z.array(catalogModelSchema),
		mcp: z.array(mcpServerViewSchema),
		/** What the configured servers can reach at all, read from both files and `settings.json`. */
		mcpReach: mcpReachSchema,
		/** What the live engines report, which is only ever "registered tools", never a connection state. */
		mcpLive: mcpLiveSchema,
		/** `settings.json` lists `-builtin:mcp`, so no session connects a configured server. */
		mcpDisabled: z.boolean(),
		/** The project whose `.pi` this snapshot reads beside the home, or null for the home alone. */
		project: projectStatusSchema.nullable(),
		/** Every skill pi sees for the home and the picked project, with why it is or is not active. */
		skills: z.array(skillViewSchema),
		/** Skills in Claude Code's and Codex's folders, which pi loads only once a folder is linked. */
		foreignSkills: z.array(foreignSkillViewSchema),
		packages: z.array(packageViewSchema),
		ready: z.boolean(),
		/** What pi's model runtime could not compose, such as an invalid provider entry. */
		error: z.string().optional(),
	})
	.openapi("SettingsSnapshot");

export type SettingsSnapshot = z.infer<typeof settingsSnapshotSchema>;
