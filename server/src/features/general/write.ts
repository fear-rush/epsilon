/**
 * The settings the panel writes through pi's own setters. One key per call, then
 * one `flush()`, so pi's write queue and merge order stay pi's. Each value is
 * parsed by the key's own schema first: the wire shape is JSON, and a browser that
 * sends the wrong type is refused before pi's setter sees it.
 *
 * Keys with no setter (compaction numbers, per-model overrides, retry delays,
 * branch summaries) are merged into `settings.json` in `store.ts` instead.
 */
import { thinkingLevelSchema } from "shared";
import { z } from "zod";

import type { AgentHome } from "../../platform/agent-home";
import { globalSettings } from "../../platform/pi";
import type { SettingView } from "./contract";

/** One of pi's own modes, as the two queue settings and the transport take it. */
const queueModeSchema = z.enum(["all", "one-at-a-time"]);

const transportSchema = z.enum(["auto", "sse", "websocket", "websocket-cached"]);
const cacheWarmingSchema = z.enum(["off", "streaming", "idle"]);
const projectTrustSchema = z.enum(["ask", "always", "never"]);
const treeFilterSchema = z.enum(["default", "no-tools", "user-only", "labeled-only", "all"]);
const timeoutSchema = z.number().int().min(0);

/** A per-model thinking level; `null` removes the override and returns to the default. */
const thinkingOverrideSchema = z.object({
	provider: z.string().min(1),
	modelId: z.string().min(1),
	level: thinkingLevelSchema.nullable(),
});

/**
 * The value pi's setter will accept for this key, or a refusal. The panel's own
 * controls only send valid shapes, so this guards the wire, not the operator; the
 * sentence says which key it refused.
 */
const checked = <T>(key: string, schema: z.ZodType<T>, value: SettingView["value"]): T => {
	const parsed = schema.safeParse(value);
	if (!parsed.success) throw new Error(`${key} cannot take that value.`);
	return parsed.data;
};

/** Write one setting and wait for pi to save its file. */
export const writeSetting = async (
	home: AgentHome,
	key: string,
	value: SettingView["value"],
): Promise<void> => {
	const settings = globalSettings(home);
	switch (key) {
		case "steeringMode":
			settings.setSteeringMode(checked(key, queueModeSchema, value));
			break;
		case "followUpMode":
			settings.setFollowUpMode(checked(key, queueModeSchema, value));
			break;
		case "defaultThinkingLevel":
			settings.setDefaultThinkingLevel(checked(key, thinkingLevelSchema, value));
			break;
		case "modelThinkingLevels": {
			const override = checked(key, thinkingOverrideSchema, value);
			if (override.level === null) {
				settings.removeModelThinkingLevel(override.provider, override.modelId);
			} else {
				settings.setModelThinkingLevel(override.provider, override.modelId, override.level);
			}
			break;
		}
		case "transport":
			settings.setTransport(checked(key, transportSchema, value));
			break;
		case "httpIdleTimeoutMs":
			settings.setHttpIdleTimeoutMs(checked(key, timeoutSchema, value));
			break;
		case "cacheWarming":
			settings.setCacheWarmingMode(checked(key, cacheWarmingSchema, value));
			break;
		case "hideThinkingBlock":
			settings.setHideThinkingBlock(checked(key, z.boolean(), value));
			break;
		case "showCacheMissNotices":
			settings.setShowCacheMissNotices(checked(key, z.boolean(), value));
			break;
		case "images.autoResize":
			settings.setImageAutoResize(checked(key, z.boolean(), value));
			break;
		case "images.blockImages":
			settings.setBlockImages(checked(key, z.boolean(), value));
			break;
		case "enableSkillCommands":
			settings.setEnableSkillCommands(checked(key, z.boolean(), value));
			break;
		case "shellPath":
			settings.setShellPath(checked(key, z.string().nullable(), value) ?? undefined);
			break;
		case "shellCommandPrefix":
			settings.setShellCommandPrefix(checked(key, z.string().nullable(), value) ?? undefined);
			break;
		case "warnings":
			settings.setWarnings(checked(key, z.object({ anthropicExtraUsage: z.boolean() }), value));
			break;
		case "enableInstallTelemetry":
			settings.setEnableInstallTelemetry(checked(key, z.boolean(), value));
			break;
		case "enableAnalytics":
			settings.setEnableAnalytics(checked(key, z.boolean(), value));
			break;
		case "defaultProjectTrust":
			settings.setDefaultProjectTrust(checked(key, projectTrustSchema, value));
			break;
		case "treeFilterMode":
			settings.setTreeFilterMode(checked(key, treeFilterSchema, value));
			break;
		default:
			throw new Error(`The panel does not write "${key}".`);
	}
	await settings.flush();
};
