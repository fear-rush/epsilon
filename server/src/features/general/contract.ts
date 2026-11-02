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
 * Which layer supplies a setting: a project's `.pi/settings.json`, the home's
 * `settings.json`, or pi's built-in default when neither file sets it. Two keys
 * are read from the home's file alone, so a project value for those supplies
 * nothing and the scope stays `global` or `default`.
 */
const settingScopeSchema = z.enum(["project", "global", "default"]).openapi("SettingScope");

/** Every value pi stores in `settings.json`, which is JSON's own shapes. */
const settingValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.array(z.string()),
	z.record(z.string(), z.unknown()),
]);

/**
 * One `settings.json` key as the panel needs it. A value is always one of JSON's
 * own shapes, which is what pi stored; the client narrows it per control.
 */
export const settingViewSchema = z
	.object({
		/** pi's own key path in `settings.json`, such as "compaction.reserveTokens". */
		key: z.string(),
		/** What pi resolves, or null when pi refused the value; `error` then says why. */
		value: settingValueSchema,
		scope: settingScopeSchema,
		/** The browser cannot apply it; the panel lists it read-only with the reason. */
		terminalOnly: z.boolean(),
		/** pi's own sentence for a value it refuses. */
		error: z.string().optional(),
	})
	.openapi("SettingView");

export type SettingScope = z.infer<typeof settingScopeSchema>;
export type SettingView = z.infer<typeof settingViewSchema>;

/**
 * The one setting a PATCH changes. The key decides the value's real type, which
 * the server checks per key before pi's setter sees it; the wire shape stays JSON
 * so the client can write any row with one call.
 */
export const settingWriteSchema = z
	.object({
		/** pi's key path, one the panel writes through a `SettingsManager` setter. */
		key: z.string().min(1),
		/** The new value, in the shape the read reports for that key. */
		value: settingValueSchema,
	})
	.openapi("SettingWriteInput");

/**
 * A settings file pi could not load. pi records the error and ignores that file,
 * so every value it holds is absent rather than wrong; the panel names the file so
 * a default is never mistaken for the operator's choice.
 */
export const settingsProblemSchema = z
	.object({
		scope: z.enum(["global", "project"]),
		path: z.string().optional(),
		/** pi's own sentence for what failed. */
		message: z.string(),
	})
	.openapi("SettingsProblem");

export type SettingsProblem = z.infer<typeof settingsProblemSchema>;
