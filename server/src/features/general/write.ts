/**
 * Every setting the panel writes, one key per call. A key with a
 * `SettingsManager` setter goes through it and then one `flush()`; a key pi only
 * reads is merged into `settings.json` through `jsonDocument`, which locks the
 * file, keeps every unknown key and its order, and refuses a file it cannot
 * parse. Each value is parsed by the key's own schema first: the wire shape is
 * JSON, and a browser that sends the wrong type is refused before pi sees it.
 */
import { join } from "node:path";
import { thinkingLevelSchema } from "shared";
import { z } from "zod";

import type { AgentHome } from "../../platform/agent-home";
import { jsonDocument } from "../../platform/json-document";
import { setOrDelete } from "../../platform/patch";
import { globalSettings } from "../../platform/pi";
import type { SettingView } from "./contract";

/** One of pi's own modes, as the two queue settings and the transport take it. */
const queueModeSchema = z.enum(["all", "one-at-a-time"]);

const transportSchema = z.enum(["auto", "sse", "websocket", "websocket-cached"]);
const cacheWarmingSchema = z.enum(["off", "streaming", "idle"]);
const projectTrustSchema = z.enum(["ask", "always", "never"]);
const treeFilterSchema = z.enum(["default", "no-tools", "user-only", "labeled-only", "all"]);
const timeoutSchema = z.number().int().min(0);

/** A token count pi requires to be a non-negative safe integer. */
const tokensSchema = z.number().int().min(0);

/** A `defaultTools` entry that adds or removes a tool instead of naming the whole list. */
const isToolModifier = (entry: string): boolean => entry.startsWith("+") || entry.startsWith("-");

/** A per-model thinking level; `null` removes the override and returns to the default. */
const thinkingOverrideSchema = z.object({
	provider: z.string().min(1),
	modelId: z.string().min(1),
	level: thinkingLevelSchema.nullable(),
});

/** One model's compaction override; a null field falls back to the ordinary number. */
const compactionOverrideSchema = z.object({
	modelKey: z.string().min(1),
	reserveTokens: tokensSchema.nullable(),
	keepRecentTokens: tokensSchema.nullable(),
});

/**
 * The file as it is: a plain object of JSON values. The branches are validated
 * per key below, not here, because a zod object with named keys writes them in
 * schema order and moves an unknown key to the end; this keeps the operator's
 * file order, so a merge changes only the key it was given.
 */
const settingsFileSchema = z.object({}).catchall(z.json());

type SettingsFile = z.infer<typeof settingsFileSchema>;

/** The same loose shape at any depth, keeping its own key order. */
const branchSchema = z.object({}).catchall(z.json());

type Branch = z.infer<typeof branchSchema>;

/** A branch as a mutable object; a value pi would ignore becomes an empty one. */
const branchOf = (value: SettingsFile[string] | undefined): Branch => {
	const parsed = branchSchema.safeParse(value);
	return parsed.success ? parsed.data : {};
};

const settingsDocument = (home: AgentHome) =>
	jsonDocument(join(home.dir, "settings.json"), {
		schema: settingsFileSchema,
		empty: (): SettingsFile => ({}),
		policy: "private",
		wording: {
			problem: (cause, path) => `Agent settings could not be read (${cause}) from ${path}.`,
			refusal: (path, problem) =>
				`Epsilon did not write agent settings because ${path} ${problem}.`,
		},
	});

/**
 * The value pi's setter or merge will accept for this key, or a refusal. The
 * panel's own controls only send valid shapes, so this guards the wire, not the
 * operator; the sentence says which key it refused.
 */
const checked = <T>(key: string, schema: z.ZodType<T>, value: SettingView["value"]): T => {
	const parsed = schema.safeParse(value);
	if (!parsed.success) throw new Error(`${key} cannot take that value.`);
	return parsed.data;
};

/**
 * `defaultTools` with one tool named or taken out. pi has a getter for that key and
 * no setter, so the file is merged. The list's own semantics decide the entry:
 * pi resolves plain names by **replacing** its defaults and `+name`/`-name` by
 * modifying them (`resolveDefaultTools` in `dist/core/settings-manager.js`), so a
 * file with no list gains `+name` rather than a list that would freeze today's
 * defaults. A list that would end up empty is removed, because pi reads an empty
 * `defaultTools` as "no tools at all" while a missing key keeps its own.
 */
export const writeDefaultTool = async (
	home: AgentHome,
	tool: string,
	enabled: boolean,
): Promise<void> => {
	await settingsDocument(home).update((current) => {
		const parsed = z.array(z.string()).safeParse(current["defaultTools"]);
		const entries = parsed.success ? parsed.data : undefined;
		const next = { ...current };
		setOrDelete(next, "defaultTools", withTool(entries, tool, enabled));
		return next;
	});
};

/** The list after naming `tool` in it, or taking it out; undefined removes the key. */
const withTool = (
	entries: readonly string[] | undefined,
	tool: string,
	enabled: boolean,
): string[] | undefined => {
	const current = [...(entries ?? [])];
	if (!enabled) {
		const next = current.filter((entry) => entry !== tool && entry !== `+${tool}`);
		return next.length === 0 ? undefined : next;
	}
	// A `-tool` entry holds it out, so naming it means dropping that entry as well.
	const on = current.filter((entry) => entry !== `-${tool}`);
	if (on.some((entry) => entry === tool || entry === `+${tool}`)) return on;
	const plain = (entry: string): boolean => !isToolModifier(entry);
	const adds = entries === undefined || (current.length > 0 && !current.some(plain));
	return [...on, adds ? `+${tool}` : tool];
};

/** Write one setting and wait for the file to hold it. */
export const writeSetting = async (
	home: AgentHome,
	key: string,
	value: SettingView["value"],
): Promise<void> => {
	const settings = globalSettings(home);
	// pi's manager records a file it could not load and then ignores every setter's
	// save, so a write would report success and change nothing.
	const unreadable = settings.drainErrors();
	if (unreadable.length > 0) {
		const files = unreadable.map((problem) => problem.path ?? `${problem.scope} settings`);
		throw new Error(`Nothing was written: pi could not load ${files.join(", ")}.`);
	}
	switch (key) {
		// The turn.
		case "steeringMode":
			settings.setSteeringMode(checked(key, queueModeSchema, value));
			break;
		case "followUpMode":
			settings.setFollowUpMode(checked(key, queueModeSchema, value));
			break;
		// Compaction: the switch is pi's, the numbers and the per-model overrides are merged.
		case "compaction.enabled":
			settings.setCompactionEnabled(checked(key, z.boolean(), value));
			break;
		case "compaction.reserveTokens": {
			const reserveTokens = checked(key, tokensSchema, value);
			await settingsDocument(home).update((current) => {
				const compaction = branchOf(current["compaction"]);
				compaction["reserveTokens"] = reserveTokens;
				return { ...current, compaction };
			});
			break;
		}
		case "compaction.keepRecentTokens": {
			const keepRecentTokens = checked(key, tokensSchema, value);
			await settingsDocument(home).update((current) => {
				const compaction = branchOf(current["compaction"]);
				compaction["keepRecentTokens"] = keepRecentTokens;
				return { ...current, compaction };
			});
			break;
		}
		case "compaction.modelOverrides": {
			const override = checked(key, compactionOverrideSchema, value);
			await settingsDocument(home).update((current) => {
				const compaction = branchOf(current["compaction"]);
				const modelOverrides = branchOf(compaction["modelOverrides"]);
				const entry = branchOf(modelOverrides[override.modelKey]);
				if (override.reserveTokens === null) delete entry["reserveTokens"];
				else entry["reserveTokens"] = override.reserveTokens;
				if (override.keepRecentTokens === null) delete entry["keepRecentTokens"];
				else entry["keepRecentTokens"] = override.keepRecentTokens;
				if (Object.keys(entry).length === 0) delete modelOverrides[override.modelKey];
				else modelOverrides[override.modelKey] = entry;
				if (Object.keys(modelOverrides).length === 0) delete compaction["modelOverrides"];
				else compaction["modelOverrides"] = modelOverrides;
				return { ...current, compaction };
			});
			break;
		}
		// Retry: the switch is pi's, the numbers are merged.
		case "retry.enabled":
			settings.setRetryEnabled(checked(key, z.boolean(), value));
			break;
		case "retry.maxRetries": {
			const maxRetries = checked(key, z.number().int().min(0), value);
			await settingsDocument(home).update((current) => {
				const retry = branchOf(current["retry"]);
				retry["maxRetries"] = maxRetries;
				return { ...current, retry };
			});
			break;
		}
		case "retry.baseDelayMs": {
			const baseDelayMs = checked(key, timeoutSchema, value);
			await settingsDocument(home).update((current) => {
				const retry = branchOf(current["retry"]);
				retry["baseDelayMs"] = baseDelayMs;
				return { ...current, retry };
			});
			break;
		}
		case "retry.maxAgentDelayMs": {
			const maxAgentDelayMs = checked(key, timeoutSchema, value);
			await settingsDocument(home).update((current) => {
				const retry = branchOf(current["retry"]);
				retry["maxAgentDelayMs"] = maxAgentDelayMs;
				return { ...current, retry };
			});
			break;
		}
		// Branch summaries: pi reads both, so both are merged.
		case "branchSummary.reserveTokens": {
			const reserveTokens = checked(key, timeoutSchema, value);
			await settingsDocument(home).update((current) => {
				const branchSummary = branchOf(current["branchSummary"]);
				branchSummary["reserveTokens"] = reserveTokens;
				return { ...current, branchSummary };
			});
			break;
		}
		case "branchSummary.skipPrompt": {
			const skipPrompt = checked(key, z.boolean(), value);
			await settingsDocument(home).update((current) => {
				const branchSummary = branchOf(current["branchSummary"]);
				branchSummary["skipPrompt"] = skipPrompt;
				return { ...current, branchSummary };
			});
			break;
		}
		// Thinking, and which models the pickers offer.
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
		case "enabledModels":
			settings.setEnabledModels(
				checked(key, z.array(z.string().min(1)).nullable(), value) ?? undefined,
			);
			break;
		// Requests: the wire, its idle timeout, and the cache warmer.
		case "transport":
			settings.setTransport(checked(key, transportSchema, value));
			break;
		case "httpIdleTimeoutMs":
			settings.setHttpIdleTimeoutMs(checked(key, timeoutSchema, value));
			break;
		case "cacheWarming":
			settings.setCacheWarmingMode(checked(key, cacheWarmingSchema, value));
			break;
		// What the transcript shows, and how images reach the model.
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
		// Shell, prompts and skills.
		case "enableSkillCommands":
			settings.setEnableSkillCommands(checked(key, z.boolean(), value));
			break;
		case "shellPath":
			settings.setShellPath(checked(key, z.string().nullable(), value) ?? undefined);
			break;
		case "shellCommandPrefix":
			settings.setShellCommandPrefix(checked(key, z.string().nullable(), value) ?? undefined);
			break;
		// Warnings, telemetry, trust and the tree picker.
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
