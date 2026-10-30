/**
 * The dashboard configuration snapshot. The server writes pi's documented files
 * and calls pi's SDK where it exposes a writer; the browser only ever sees this
 * shape (docs/adr/0012-configure-in-the-dashboard.md).
 */
import { z } from "@hono/zod-openapi";

import { defaultModelSchema } from "../general";
import { mcpServerViewSchema } from "../mcp/contract";
import { packageViewSchema } from "../packages";
import { builtinProviderSchema, catalogModelSchema, providerViewSchema } from "../providers";
import { skillViewSchema } from "../skills";

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
		/** `settings.json` lists `-builtin:mcp`, so no session connects a configured server. */
		mcpDisabled: z.boolean(),
		/** The folder this deployment runs in, and therefore the project `mcp.json` it reads. */
		projectDir: z.string(),
		skills: z.array(skillViewSchema),
		packages: z.array(packageViewSchema),
		ready: z.boolean(),
		/** What pi's model runtime could not compose, such as an invalid provider entry. */
		error: z.string().optional(),
	})
	.openapi("SettingsSnapshot");

export type SettingsSnapshot = z.infer<typeof settingsSnapshotSchema>;
