import { join } from "node:path";

import { Context, Effect, Layer, Schema } from "effect";

import { SettingRefused } from "#protocol/errors";
import type { DefaultModel, GeneralView, SettingValue } from "#protocol/settings/general";

import { AgentHome } from "../../platform/agent-home.ts";
import type { AgentHomeApi } from "../../platform/agent-home.ts";
import { JsonDocument } from "../../platform/json-document.ts";
import type { JsonDocumentApi, JsonObject } from "../../platform/json-document.ts";
import { isJsonObject } from "../../platform/patch.ts";
import { PiConfig } from "../../platform/pi.ts";
import type { PiConfigApi, SettingsManager } from "../../platform/pi.ts";
import { readSettingViews, readSettingsProblems } from "./catalog.ts";

/**
 * pi's `settings.json`, read through pi's own manager and written through pi's own setters.
 *
 * A key pi has a setter for goes through it and one `flush()`, so pi's queue, merge order
 * and lock do the writing. The keys pi only reads are merged into the file with
 * `JsonDocument`, which takes pi's lockfile, keeps unknown keys and refuses a file it
 * cannot parse. Before either, pi's load errors are checked: its manager records a file it
 * could not load and then ignores every save, so a write would report success and change
 * nothing.
 *
 * Every value is decoded per key before pi sees it. The wire carries JSON, and a page that
 * sends the wrong shape is refused with the key's name instead of corrupting the file.
 */

export type GeneralStoreApi = {
	readonly read: (folder: string | null) => Effect.Effect<GeneralView>;
	readonly write: (key: string, value: SettingValue) => Effect.Effect<void, SettingRefused>;
	readonly setDefaultModel: (model: DefaultModel) => Effect.Effect<void, SettingRefused>;
};

export class GeneralStore extends Context.Service<GeneralStore, GeneralStoreApi>()(
	"epsilon/GeneralStore",
) {}

const refusal = (key: string, reason: string): SettingRefused =>
	new SettingRefused({ key, reason });

/** Decode the wire value against the key's own schema; the key's name is the refusal. */
type DecodeWith = <A>(
	schema: Schema.ConstraintDecoder<A>,
	key: string,
	wanted: string,
	value: SettingValue,
) => Effect.Effect<A, SettingRefused>;

const decode: DecodeWith = (schema, key, wanted, value) =>
	Effect.fromOption(Schema.decodeOption(schema)(value), () =>
		refusal(key, `${key} takes ${wanted}.`),
	);

const flag = (key: string, value: SettingValue) =>
	decode(Schema.Boolean, key, "true or false", value);
const count = (key: string, value: SettingValue) =>
	decode(Count, key, "a whole number of at least zero", value);

const choice =
	<const Values extends ReadonlyArray<string>>(key: string, values: Values) =>
	(value: SettingValue) =>
		decode(Schema.Literals(values), key, `one of ${values.join(", ")}`, value);

/** pi's token counts and timeouts are whole numbers of at least zero. */
const Count = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)));

const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

const ThinkingOverride = Schema.Struct({
	level: Schema.NullOr(Schema.Literals(thinkingLevels)),
	modelId: Schema.String,
	provider: Schema.String,
});

const CompactionOverride = Schema.Struct({
	keepRecentTokens: Schema.NullOr(Count),
	modelKey: Schema.String,
	reserveTokens: Schema.NullOr(Count),
});

const Warnings = Schema.Struct({ anthropicExtraUsage: Schema.Boolean });

const branchOf = (current: JsonObject, name: string): JsonObject => {
	const value = current[name];
	return isJsonObject(value) ? value : {};
};

/** One number under one branch, keeping the branch's other keys and the file's order. */
const patchNumber =
	(branch: string, field: string) =>
	(next: number): ((current: JsonObject) => JsonObject) =>
	(current) => ({ [branch]: { ...branchOf(current, branch), [field]: next } });

/** One boolean under one branch. */
const patchFlag =
	(branch: string, field: string) =>
	(next: boolean): ((current: JsonObject) => JsonObject) =>
	(current) => ({ [branch]: { ...branchOf(current, branch), [field]: next } });

/** pi ignores every setter once a file it loads failed, so refuse with that file's name. */
const readable = (settings: SettingsManager, key: string): Effect.Effect<void, SettingRefused> =>
	Effect.suspend(() => {
		const broken = settings.drainErrors();
		if (broken.length === 0) return Effect.void;
		const files = broken.map((problem) => problem.path ?? `${problem.scope} settings`);
		return Effect.fail(refusal(key, `Nothing was written: pi could not load ${files.join(", ")}.`));
	});

const flush = (settings: SettingsManager, key: string): Effect.Effect<void, SettingRefused> =>
	Effect.tryPromise({
		try: () => settings.flush(),
		catch: (cause) =>
			refusal(
				key,
				`pi could not save settings.json (${cause instanceof Error ? cause.message : String(cause)}).`,
			),
	});

type Writer = (value: SettingValue) => Effect.Effect<void, SettingRefused>;

export const makeGeneralStore = (deps: {
	readonly home: AgentHomeApi;
	readonly config: PiConfigApi;
	readonly document: JsonDocumentApi;
}): GeneralStoreApi => {
	const settingsPath = join(deps.home.agentDir, "settings.json");

	/** A fresh manager for each read or write: pi merges files at creation, so a stale one lies. */
	const manager = (folder: string | null): Effect.Effect<SettingsManager> =>
		deps.config.settings(folder ?? deps.home.agentDir);

	const read = (folder: string | null): Effect.Effect<GeneralView> =>
		Effect.gen(function* () {
			const settings = yield* manager(folder);
			const provider = settings.getDefaultProvider();
			const modelId = settings.getDefaultModel();
			return {
				defaultModel:
					provider === undefined || modelId === undefined ? null : { modelId, provider },
				problems: [...readSettingsProblems(settings)],
				rows: [...(yield* readSettingViews(settings, folder))],
			};
		});

	const merge = (
		key: string,
		change: (current: JsonObject) => JsonObject,
	): Effect.Effect<void, SettingRefused> =>
		deps.document.update(settingsPath, change, { lock: "pi" }).pipe(
			Effect.asVoid,
			Effect.catchTags({
				FileUnreadable: (error) => Effect.fail(refusal(key, error.reason)),
				FileUnwritable: (error) => Effect.fail(refusal(key, error.reason)),
				Locked: () => Effect.fail(refusal(key, "pi holds settings.json; try again.")),
				NotJson: (error) =>
					Effect.fail(refusal(key, `settings.json could not be read: ${error.reason}`)),
			}),
		);

	const apply = (
		key: string,
		change: (settings: SettingsManager) => void,
	): Effect.Effect<void, SettingRefused> =>
		Effect.gen(function* () {
			const settings = yield* manager(null);
			yield* readable(settings, key);
			change(settings);
			yield* flush(settings, key);
		});

	const writers = new Map<string, Writer>([
		// How a second message is handled while a turn runs.
		[
			"steeringMode",
			(value) =>
				Effect.gen(function* () {
					const mode = yield* choice("steeringMode", ["all", "one-at-a-time"] as const)(value);
					yield* apply("steeringMode", (settings) => settings.setSteeringMode(mode));
				}),
		],
		[
			"followUpMode",
			(value) =>
				Effect.gen(function* () {
					const mode = yield* choice("followUpMode", ["all", "one-at-a-time"] as const)(value);
					yield* apply("followUpMode", (settings) => settings.setFollowUpMode(mode));
				}),
		],
		// Compaction: the switch is pi's, the numbers and the overrides are merged.
		[
			"compaction.enabled",
			(value) =>
				Effect.gen(function* () {
					const enabled = yield* flag("compaction.enabled", value);
					yield* apply("compaction.enabled", (settings) => settings.setCompactionEnabled(enabled));
				}),
		],
		[
			"compaction.reserveTokens",
			(value) =>
				Effect.gen(function* () {
					const tokens = yield* count("compaction.reserveTokens", value);
					yield* merge(
						"compaction.reserveTokens",
						patchNumber("compaction", "reserveTokens")(tokens),
					);
				}),
		],
		[
			"compaction.keepRecentTokens",
			(value) =>
				Effect.gen(function* () {
					const tokens = yield* count("compaction.keepRecentTokens", value);
					yield* merge(
						"compaction.keepRecentTokens",
						patchNumber("compaction", "keepRecentTokens")(tokens),
					);
				}),
		],
		[
			"compaction.modelOverrides",
			(value) =>
				Effect.gen(function* () {
					const override = yield* decode(
						CompactionOverride,
						"compaction.modelOverrides",
						"a model key and its token limits",
						value,
					);
					yield* merge("compaction.modelOverrides", (current) => {
						const compaction = branchOf(current, "compaction");
						const overrides = branchOf(compaction, "modelOverrides");
						const entry: JsonObject = {};
						if (override.reserveTokens !== null) entry["reserveTokens"] = override.reserveTokens;
						if (override.keepRecentTokens !== null) {
							entry["keepRecentTokens"] = override.keepRecentTokens;
						}
						const next = { ...overrides };
						if (Object.keys(entry).length === 0) delete next[override.modelKey];
						else next[override.modelKey] = entry;
						const branch = { ...compaction };
						if (Object.keys(next).length === 0) delete branch["modelOverrides"];
						else branch["modelOverrides"] = next;
						return { ...current, compaction: branch };
					});
				}),
		],
		// Retry: the switch is pi's, the numbers are merged.
		[
			"retry.enabled",
			(value) =>
				Effect.gen(function* () {
					const enabled = yield* flag("retry.enabled", value);
					yield* apply("retry.enabled", (settings) => settings.setRetryEnabled(enabled));
				}),
		],
		[
			"retry.maxRetries",
			(value) =>
				Effect.gen(function* () {
					const retries = yield* count("retry.maxRetries", value);
					yield* merge("retry.maxRetries", patchNumber("retry", "maxRetries")(retries));
				}),
		],
		[
			"retry.baseDelayMs",
			(value) =>
				Effect.gen(function* () {
					const ms = yield* count("retry.baseDelayMs", value);
					yield* merge("retry.baseDelayMs", patchNumber("retry", "baseDelayMs")(ms));
				}),
		],
		[
			"retry.maxAgentDelayMs",
			(value) =>
				Effect.gen(function* () {
					const ms = yield* count("retry.maxAgentDelayMs", value);
					yield* merge("retry.maxAgentDelayMs", patchNumber("retry", "maxAgentDelayMs")(ms));
				}),
		],
		// Branch summaries use their own reserve and may skip the prompt.
		[
			"branchSummary.reserveTokens",
			(value) =>
				Effect.gen(function* () {
					const tokens = yield* count("branchSummary.reserveTokens", value);
					yield* merge(
						"branchSummary.reserveTokens",
						patchNumber("branchSummary", "reserveTokens")(tokens),
					);
				}),
		],
		[
			"branchSummary.skipPrompt",
			(value) =>
				Effect.gen(function* () {
					const skip = yield* flag("branchSummary.skipPrompt", value);
					yield* merge("branchSummary.skipPrompt", patchFlag("branchSummary", "skipPrompt")(skip));
				}),
		],
		// Thinking, and which models the pickers offer.
		[
			"defaultThinkingLevel",
			(value) =>
				Effect.gen(function* () {
					const level = yield* choice("defaultThinkingLevel", thinkingLevels)(value);
					yield* apply("defaultThinkingLevel", (settings) =>
						settings.setDefaultThinkingLevel(level),
					);
				}),
		],
		[
			"modelThinkingLevels",
			(value) =>
				Effect.gen(function* () {
					const override = yield* decode(
						ThinkingOverride,
						"modelThinkingLevels",
						"a provider, a model and its level",
						value,
					);
					yield* apply("modelThinkingLevels", (settings) => {
						if (override.level === null) {
							settings.removeModelThinkingLevel(override.provider, override.modelId);
						} else {
							settings.setModelThinkingLevel(override.provider, override.modelId, override.level);
						}
					});
				}),
		],
		[
			"enabledModels",
			(value) =>
				Effect.gen(function* () {
					const patterns = yield* decode(
						Schema.NullOr(Schema.Array(Schema.String)),
						"enabledModels",
						"a list of patterns or null",
						value,
					);
					yield* apply("enabledModels", (settings) =>
						settings.setEnabledModels(patterns === null ? undefined : [...patterns]),
					);
				}),
		],
		// Requests: the wire, its idle timeout, and the cache warmer.
		[
			"transport",
			(value) =>
				Effect.gen(function* () {
					const transport = yield* choice("transport", [
						"auto",
						"sse",
						"websocket",
						"websocket-cached",
					] as const)(value);
					yield* apply("transport", (settings) => settings.setTransport(transport));
				}),
		],
		[
			"httpIdleTimeoutMs",
			(value) =>
				Effect.gen(function* () {
					const ms = yield* count("httpIdleTimeoutMs", value);
					yield* apply("httpIdleTimeoutMs", (settings) => settings.setHttpIdleTimeoutMs(ms));
				}),
		],
		[
			"cacheWarming",
			(value) =>
				Effect.gen(function* () {
					const mode = yield* choice("cacheWarming", ["off", "streaming", "idle"] as const)(value);
					yield* apply("cacheWarming", (settings) => settings.setCacheWarmingMode(mode));
				}),
		],
		// What the transcript shows, and how images reach the model.
		[
			"hideThinkingBlock",
			(value) =>
				Effect.gen(function* () {
					const hide = yield* flag("hideThinkingBlock", value);
					yield* apply("hideThinkingBlock", (settings) => settings.setHideThinkingBlock(hide));
				}),
		],
		[
			"showCacheMissNotices",
			(value) =>
				Effect.gen(function* () {
					const show = yield* flag("showCacheMissNotices", value);
					yield* apply("showCacheMissNotices", (settings) =>
						settings.setShowCacheMissNotices(show),
					);
				}),
		],
		[
			"images.autoResize",
			(value) =>
				Effect.gen(function* () {
					const resize = yield* flag("images.autoResize", value);
					yield* apply("images.autoResize", (settings) => settings.setImageAutoResize(resize));
				}),
		],
		[
			"images.blockImages",
			(value) =>
				Effect.gen(function* () {
					const block = yield* flag("images.blockImages", value);
					yield* apply("images.blockImages", (settings) => settings.setBlockImages(block));
				}),
		],
		// Shell, prompts and skills.
		[
			"enableSkillCommands",
			(value) =>
				Effect.gen(function* () {
					const enabled = yield* flag("enableSkillCommands", value);
					yield* apply("enableSkillCommands", (settings) =>
						settings.setEnableSkillCommands(enabled),
					);
				}),
		],
		[
			"shellPath",
			(value) =>
				Effect.gen(function* () {
					const path = yield* decode(
						Schema.NullOr(Schema.String),
						"shellPath",
						"a path or null",
						value,
					);
					yield* apply("shellPath", (settings) => settings.setShellPath(path ?? undefined));
				}),
		],
		[
			"shellCommandPrefix",
			(value) =>
				Effect.gen(function* () {
					const prefix = yield* decode(
						Schema.NullOr(Schema.String),
						"shellCommandPrefix",
						"a string or null",
						value,
					);
					yield* apply("shellCommandPrefix", (settings) =>
						settings.setShellCommandPrefix(prefix ?? undefined),
					);
				}),
		],
		// Warnings, telemetry, trust and the tree picker.
		[
			"warnings",
			(value) =>
				Effect.gen(function* () {
					const warnings = yield* decode(Warnings, "warnings", "the warning switches", value);
					yield* apply("warnings", (settings) => settings.setWarnings(warnings));
				}),
		],
		[
			"enableInstallTelemetry",
			(value) =>
				Effect.gen(function* () {
					const enabled = yield* flag("enableInstallTelemetry", value);
					yield* apply("enableInstallTelemetry", (settings) =>
						settings.setEnableInstallTelemetry(enabled),
					);
				}),
		],
		[
			"enableAnalytics",
			(value) =>
				Effect.gen(function* () {
					const enabled = yield* flag("enableAnalytics", value);
					yield* apply("enableAnalytics", (settings) => settings.setEnableAnalytics(enabled));
				}),
		],
		[
			"defaultProjectTrust",
			(value) =>
				Effect.gen(function* () {
					const trust = yield* choice("defaultProjectTrust", ["ask", "always", "never"] as const)(
						value,
					);
					yield* apply("defaultProjectTrust", (settings) => settings.setDefaultProjectTrust(trust));
				}),
		],
		[
			"treeFilterMode",
			(value) =>
				Effect.gen(function* () {
					const mode = yield* choice("treeFilterMode", [
						"default",
						"no-tools",
						"user-only",
						"labeled-only",
						"all",
					] as const)(value);
					yield* apply("treeFilterMode", (settings) => settings.setTreeFilterMode(mode));
				}),
		],
	]);

	const write = (key: string, value: SettingValue): Effect.Effect<void, SettingRefused> => {
		const writer = writers.get(key);
		return writer === undefined
			? Effect.fail(refusal(key, `Epsilon does not write ${key}.`))
			: writer(value);
	};

	return {
		read,
		setDefaultModel: (model) =>
			Effect.gen(function* () {
				const runtime = yield* deps.config.models.pipe(
					Effect.catchTag("RuntimeUnavailable", (error) =>
						Effect.fail(refusal("defaultModel", `pi could not read its models: ${error.reason}`)),
					),
				);
				const known = runtime.getModel(model.provider, model.modelId) !== undefined;
				yield* known
					? Effect.void
					: Effect.fail(
							refusal(
								"defaultModel",
								`pi does not know the model ${model.provider}/${model.modelId}.`,
							),
						);
				const settings = yield* manager(null);
				yield* readable(settings, "defaultModel");
				settings.setDefaultModelAndProvider(model.provider, model.modelId);
				yield* flush(settings, "defaultModel");
			}),
		write,
	};
};

export const GeneralStoreLive: Layer.Layer<
	GeneralStore,
	never,
	AgentHome | PiConfig | JsonDocument
> = Layer.effect(
	GeneralStore,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const config = yield* PiConfig;
		const document = yield* JsonDocument;
		return makeGeneralStore({ config, document, home });
	}),
);
