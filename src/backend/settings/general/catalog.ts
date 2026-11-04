import { Effect } from "effect";

import type { SettingScope, SettingView, SettingsProblem } from "#protocol/settings/general";

import type { SettingsManager } from "../../platform/pi.ts";

/**
 * Every `settings.json` key the dashboard names, read once.
 *
 * pi's `SettingsManager` merges the home's file with a project's, then falls back to a
 * built-in default, and its getters are the only thing that applies that order. The same
 * manager reports each layer as it was loaded, so a project override is named as one
 * instead of disappearing behind the merged value. Three getters throw on a value pi
 * refuses (`compaction.reserveTokens`, `compaction.keepRecentTokens`,
 * `httpIdleTimeoutMs`), so each key is read on its own: one hand-edited number becomes
 * that key's own error, not a failed page.
 */

/** One layer of pi's settings, as its manager loaded it from a file. */
type SettingsLayer = ReturnType<SettingsManager["getGlobalSettings"]>;

/** One value a getter resolves. `unknown` because pi's own type is per key. */
type StoredValue = SettingView["value"] | undefined;

/** One key, the getter that resolves it, and whether a layer's file writes it. */
type SettingRow = {
	/** pi's own key path in `settings.json`. */
	key: string;
	/** The getter that resolves it, default included. Throws when pi refuses the value. */
	read: (settings: SettingsManager) => StoredValue;
	/** Whether this layer's own file holds the key, which is what names the scope. */
	present: (layer: SettingsLayer) => boolean;
	/** pi reads this key from the home's file alone, so a project value does nothing. */
	globalOnly?: true;
	/** Only a terminal can apply the value; the page lists it read-only. */
	terminalOnly?: true;
};

/** In the order the page groups them: the turn, then each area of pi's file. */
const rows: ReadonlyArray<SettingRow> = [
	// How a second message is handled while a turn runs.
	{
		key: "steeringMode",
		read: (settings) => settings.getSteeringMode(),
		present: (layer) => layer.steeringMode !== undefined,
	},
	{
		key: "followUpMode",
		read: (settings) => settings.getFollowUpMode(),
		present: (layer) => layer.followUpMode !== undefined,
	},
	// Compaction: when pi summarises, and how much it keeps.
	{
		key: "compaction.enabled",
		read: (settings) => settings.getCompactionEnabled(),
		present: (layer) => layer.compaction?.enabled !== undefined,
	},
	{
		key: "compaction.reserveTokens",
		read: (settings) => settings.getCompactionReserveTokens(),
		present: (layer) => layer.compaction?.reserveTokens !== undefined,
	},
	{
		key: "compaction.keepRecentTokens",
		read: (settings) => settings.getCompactionKeepRecentTokens(),
		present: (layer) => layer.compaction?.keepRecentTokens !== undefined,
	},
	{
		key: "compaction.modelOverrides",
		read: (settings) => settings.getSettings().compaction?.modelOverrides ?? null,
		present: (layer) => layer.compaction?.modelOverrides !== undefined,
	},
	// Retry after a transient provider failure.
	{
		key: "retry.enabled",
		read: (settings) => settings.getRetryEnabled(),
		present: (layer) => layer.retry?.enabled !== undefined,
	},
	{
		key: "retry.maxRetries",
		read: (settings) => settings.getRetrySettings().maxRetries,
		present: (layer) => layer.retry?.maxRetries !== undefined,
	},
	{
		key: "retry.baseDelayMs",
		read: (settings) => settings.getRetrySettings().baseDelayMs,
		present: (layer) => layer.retry?.baseDelayMs !== undefined,
	},
	{
		key: "retry.maxAgentDelayMs",
		read: (settings) => settings.getRetrySettings().maxAgentDelayMs,
		present: (layer) => layer.retry?.maxAgentDelayMs !== undefined,
	},
	// Branch summaries use their own reserve and may skip the prompt.
	{
		key: "branchSummary.reserveTokens",
		read: (settings) => settings.getBranchSummarySettings().reserveTokens,
		present: (layer) => layer.branchSummary?.reserveTokens !== undefined,
	},
	{
		key: "branchSummary.skipPrompt",
		read: (settings) => settings.getBranchSummarySettings().skipPrompt,
		present: (layer) => layer.branchSummary?.skipPrompt !== undefined,
	},
	// Thinking, and which models the pickers offer.
	{
		key: "defaultThinkingLevel",
		read: (settings) => settings.getDefaultThinkingLevel(),
		present: (layer) => layer.defaultThinkingLevel !== undefined,
	},
	{
		key: "modelThinkingLevels",
		read: (settings) => settings.getAllModelThinkingLevels(),
		present: (layer) => layer.modelThinkingLevels !== undefined,
	},
	{
		key: "enabledModels",
		read: (settings) => settings.getEnabledModels(),
		present: (layer) => layer.enabledModels !== undefined,
	},
	// Requests: the wire, its idle timeout, and the cache warmer.
	{
		key: "transport",
		read: (settings) => settings.getTransport(),
		present: (layer) => layer.transport !== undefined,
	},
	{
		key: "httpIdleTimeoutMs",
		read: (settings) => settings.getHttpIdleTimeoutMs(),
		present: (layer) => layer.httpIdleTimeoutMs !== undefined,
	},
	{
		key: "cacheWarming",
		read: (settings) => settings.getCacheWarmingMode(),
		present: (layer) => layer.cacheWarming !== undefined,
		globalOnly: true,
	},
	// What the transcript shows, and how images reach the model.
	{
		key: "hideThinkingBlock",
		read: (settings) => settings.getHideThinkingBlock(),
		present: (layer) => layer.hideThinkingBlock !== undefined,
	},
	{
		key: "showCacheMissNotices",
		read: (settings) => settings.getShowCacheMissNotices(),
		present: (layer) => layer.showCacheMissNotices !== undefined,
	},
	{
		key: "images.autoResize",
		read: (settings) => settings.getImageAutoResize(),
		present: (layer) => layer.images?.autoResize !== undefined,
	},
	{
		key: "images.blockImages",
		read: (settings) => settings.getBlockImages(),
		present: (layer) => layer.images?.blockImages !== undefined,
	},
	// Shell, prompts and skills.
	{
		key: "enableSkillCommands",
		read: (settings) => settings.getEnableSkillCommands(),
		present: (layer) => layer.enableSkillCommands !== undefined,
	},
	{
		key: "shellPath",
		read: (settings) => settings.getShellPath(),
		present: (layer) => layer.shellPath !== undefined,
	},
	{
		key: "shellCommandPrefix",
		read: (settings) => settings.getShellCommandPrefix(),
		present: (layer) => layer.shellCommandPrefix !== undefined,
	},
	// Warnings, telemetry, trust and the tree picker.
	{
		key: "warnings",
		read: (settings) => ({ ...settings.getWarnings() }),
		present: (layer) => layer.warnings !== undefined,
	},
	{
		key: "enableInstallTelemetry",
		read: (settings) => settings.getEnableInstallTelemetry(),
		present: (layer) => layer.enableInstallTelemetry !== undefined,
	},
	{
		key: "enableAnalytics",
		read: (settings) => settings.getEnableAnalytics(),
		present: (layer) => layer.enableAnalytics !== undefined,
	},
	{
		key: "defaultProjectTrust",
		read: (settings) => settings.getDefaultProjectTrust(),
		present: (layer) => layer.defaultProjectTrust !== undefined,
		globalOnly: true,
	},
	{
		key: "treeFilterMode",
		read: (settings) => settings.getTreeFilterMode(),
		present: (layer) => layer.treeFilterMode !== undefined,
	},
	// Read-only in the browser: each value only means something in a terminal.
	{
		key: "theme",
		read: (settings) => settings.getThemeSetting(),
		present: (layer) => layer.theme !== undefined,
		terminalOnly: true,
	},
	{
		key: "tuiMode",
		read: (settings) => settings.getTuiMode(),
		present: (layer) => layer.tuiMode !== undefined,
		terminalOnly: true,
	},
	{
		key: "fullscreenExitOutput",
		read: (settings) => settings.getFullscreenExitOutput(),
		present: (layer) => layer.fullscreenExitOutput !== undefined,
		terminalOnly: true,
	},
	{
		key: "fullscreenScrollbar",
		read: (settings) => settings.getFullscreenScrollbar(),
		present: (layer) => layer.fullscreenScrollbar !== undefined,
		terminalOnly: true,
	},
	{
		key: "fullscreenCopyOnSelect",
		read: (settings) => settings.getFullscreenCopyOnSelect(),
		present: (layer) => layer.fullscreenCopyOnSelect !== undefined,
		terminalOnly: true,
	},
	{
		key: "fullscreenWheelScrollLines",
		read: (settings) => settings.getFullscreenWheelScrollLines(),
		present: (layer) => layer.fullscreenWheelScrollLines !== undefined,
		terminalOnly: true,
	},
	{
		key: "showHardwareCursor",
		read: (settings) => settings.getShowHardwareCursor(),
		present: (layer) => layer.showHardwareCursor !== undefined,
		terminalOnly: true,
	},
	{
		key: "editorPaddingX",
		read: (settings) => settings.getEditorPaddingX(),
		present: (layer) => layer.editorPaddingX !== undefined,
		terminalOnly: true,
	},
	{
		key: "outputPad",
		read: (settings) => settings.getOutputPad(),
		present: (layer) => layer.outputPad !== undefined,
		terminalOnly: true,
	},
	{
		key: "autocompleteMaxVisible",
		read: (settings) => settings.getAutocompleteMaxVisible(),
		present: (layer) => layer.autocompleteMaxVisible !== undefined,
		terminalOnly: true,
	},
	{
		key: "terminal.showTerminalProgress",
		read: (settings) => settings.getShowTerminalProgress(),
		present: (layer) => layer.terminal?.showTerminalProgress !== undefined,
		terminalOnly: true,
	},
	{
		key: "terminal.clearOnShrink",
		read: (settings) => settings.getClearOnShrink(),
		present: (layer) => layer.terminal?.clearOnShrink !== undefined,
		terminalOnly: true,
	},
	{
		key: "terminal.showImages",
		read: (settings) => settings.getShowImages(),
		present: (layer) => layer.terminal?.showImages !== undefined,
		terminalOnly: true,
	},
	{
		key: "terminal.imageWidthCells",
		read: (settings) => settings.getImageWidthCells(),
		present: (layer) => layer.terminal?.imageWidthCells !== undefined,
		terminalOnly: true,
	},
	{
		key: "markdown.mermaid",
		read: (settings) => settings.getMermaidRenderingMode(),
		present: (layer) => layer.markdown?.mermaid !== undefined,
		terminalOnly: true,
	},
	{
		key: "quietStartup",
		read: (settings) => settings.getQuietStartup(),
		present: (layer) => layer.quietStartup !== undefined,
		terminalOnly: true,
	},
	{
		key: "collapseChangelog",
		read: (settings) => settings.getCollapseChangelog(),
		present: (layer) => layer.collapseChangelog !== undefined,
		terminalOnly: true,
	},
	{
		key: "doubleEscapeAction",
		read: (settings) => settings.getDoubleEscapeAction(),
		present: (layer) => layer.doubleEscapeAction !== undefined,
		terminalOnly: true,
	},
];

/** One key's value and, when pi refuses it, pi's own sentence. */
const readOf = (
	row: SettingRow,
	settings: SettingsManager,
): Effect.Effect<{ readonly error: string | undefined; readonly value: SettingView["value"] }> =>
	Effect.try({
		try: () => row.read(settings) ?? null,
		catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
	}).pipe(
		// pi's sentence is what the page shows for that key; a failed read is not silence.
		Effect.match({
			onFailure: (reason) => ({ error: reason, value: null }),
			onSuccess: (value) => ({ error: undefined, value }),
		}),
	);

/**
 * `folder` is a trusted project, or null for the agent home alone. The home's file and
 * the project's are read as their own layers, so a value the project overrides is
 * reported as the project's even though the effective value is the same key.
 */
export const readSettingViews = (
	settings: SettingsManager,
	folder: string | null,
): Effect.Effect<ReadonlyArray<SettingView>> => {
	const global = settings.getGlobalSettings();
	const project: SettingsLayer = folder === null ? {} : settings.getProjectSettings();
	return Effect.forEach(
		rows,
		(row) =>
			readOf(row, settings).pipe(
				Effect.map(({ error, value }) => {
					const scope: SettingScope =
						row.globalOnly !== true && row.present(project)
							? "project"
							: row.present(global)
								? "global"
								: "default";
					const view: SettingView = {
						key: row.key,
						scope,
						terminalOnly: row.terminalOnly === true,
						value,
					};
					return error === undefined ? view : Object.assign(view, { error });
				}),
			),
		{ concurrency: 1 },
	);
};

/** The settings files pi itself could not load, in pi's own words. */
export const readSettingsProblems = (settings: SettingsManager): ReadonlyArray<SettingsProblem> =>
	settings.drainErrors().map((problem) => {
		const view: SettingsProblem = { message: problem.error.message, scope: problem.scope };
		return problem.path === undefined ? view : Object.assign(view, { path: problem.path });
	});
