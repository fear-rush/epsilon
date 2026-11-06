/**
 * The panel's words around pi's settings keys. The read supplies each value and
 * the layer that set it; this file says what the value means, which control shows
 * it, and, for a key only a terminal can apply, why. pi's own sentences from
 * `docs/settings.md` and its settings menu are reused wherever they exist, so the
 * page and the terminal name one setting the same way.
 */
import type { ThinkingLevel } from "#protocol/conversation/session";

const THINKING_LEVELS: ReadonlyArray<ThinkingLevel> = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
	off: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra high",
	max: "Max",
};

export type SettingOption = { value: string; label: string };

/** How a key's value is shown and written. */
type SettingControl =
	| { kind: "switch" }
	| { kind: "select"; options: readonly SettingOption[] }
	| { kind: "text"; placeholder?: string }
	| { kind: "number" }
	| { kind: "models" }
	| { kind: "levels" }
	| { kind: "compactionOverrides" }
	| { kind: "warnings" };

export type SettingEntry = {
	/** pi's key path, which is also the read's `key`. */
	key: string;
	label: string;
	description?: string;
	control: SettingControl;
};

/** A key whose value only means something in a terminal. */
export type TerminalEntry = { key: string; label: string; reason: string };

export type SettingGroup = {
	title: string;
	description?: string;
	entries: readonly SettingEntry[];
};

const queueModeOptions: readonly SettingOption[] = [
	{ value: "one-at-a-time", label: "One at a time" },
	{ value: "all", label: "All at once" },
];

export const thinkingOptions: readonly SettingOption[] = THINKING_LEVELS.map((level) => ({
	value: level,
	label: THINKING_LEVEL_LABELS[level],
}));

export const settingGroups: readonly SettingGroup[] = [
	{
		title: "Queued messages",
		description: "Messages sent while the agent works.",
		entries: [
			{
				key: "steeringMode",
				label: "Steering mode",
				description: "Sent while the agent works. One at a time, or all together.",
				control: { kind: "select", options: queueModeOptions },
			},
			{
				key: "followUpMode",
				label: "Follow-up mode",
				description: "Held until the agent stops. One at a time, or all together.",
				control: { kind: "select", options: queueModeOptions },
			},
		],
	},
	{
		title: "Compaction",
		description: "Summarising a chat that nears the context limit.",
		entries: [
			{
				key: "compaction.enabled",
				label: "Automatic compaction",
				control: { kind: "switch" },
			},
			{
				key: "compaction.reserveTokens",
				label: "Reserve tokens",
				description: "Compacts when free context falls below this.",
				control: { kind: "number" },
			},
			{
				key: "compaction.keepRecentTokens",
				label: "Keep recent tokens",
				description: "Recent tokens kept as they are.",
				control: { kind: "number" },
			},
			{
				key: "compaction.modelOverrides",
				label: "Per-model reserves",
				description: "Per provider/model. Blank uses the number above.",
				control: { kind: "compactionOverrides" },
			},
		],
	},
	{
		title: "Retry",
		entries: [
			{
				key: "retry.enabled",
				label: "Automatic retry",
				description: "Retry failed requests.",
				control: { kind: "switch" },
			},
			{
				key: "retry.maxRetries",
				label: "Max retries",
				description: "Most attempts.",
				control: { kind: "number" },
			},
			{
				key: "retry.baseDelayMs",
				label: "Base delay",
				description: "First wait, in milliseconds.",
				control: { kind: "number" },
			},
			{
				key: "retry.maxAgentDelayMs",
				label: "Longest delay",
				description: "Longest wait, in milliseconds.",
				control: { kind: "number" },
			},
		],
	},
	{
		title: "Branch summaries",
		description: "Summaries when you branch from earlier.",
		entries: [
			{
				key: "branchSummary.reserveTokens",
				label: "Reserve tokens",
				description: "Tokens kept free for the summary.",
				control: { kind: "number" },
			},
			{
				key: "branchSummary.skipPrompt",
				label: "Skip the prompt",
				description: "Branch without asking, with no summary.",
				control: { kind: "switch" },
			},
		],
	},
	{
		title: "Models and thinking",
		entries: [
			{
				key: "defaultThinkingLevel",
				label: "Startup thinking level",
				description: "Thinking level a chat starts with.",
				control: { kind: "select", options: thinkingOptions },
			},
			{
				key: "modelThinkingLevels",
				label: "Per-model thinking level",
				description: "Per provider/model.",
				control: { kind: "levels" },
			},
			{
				key: "enabledModels",
				label: "Enabled models",
				description:
					"Model patterns to pick from and cycle through, like --models. Empty offers every model.",
				control: { kind: "models" },
			},
		],
	},
	{
		title: "Requests",
		entries: [
			{
				key: "transport",
				label: "Transport",
				description: "How requests reach providers that offer a choice.",
				control: {
					kind: "select",
					options: [
						{ value: "auto", label: "Auto" },
						{ value: "sse", label: "Server-sent events" },
						{ value: "websocket", label: "WebSocket" },
						{ value: "websocket-cached", label: "WebSocket, cached" },
					],
				},
			},
			{
				key: "httpIdleTimeoutMs",
				label: "HTTP idle timeout",
				description: "Milliseconds of silence before giving up. 0 turns it off.",
				control: { kind: "number" },
			},
			{
				key: "cacheWarming",
				label: "Cache warming",
				description: "Keeps provider prompt caches warm. Read from the agent home.",
				control: {
					kind: "select",
					options: [
						{ value: "off", label: "Off" },
						{ value: "streaming", label: "During runs" },
						{ value: "idle", label: "Between runs too" },
					],
				},
			},
		],
	},
	{
		title: "Transcript and images",
		entries: [
			{
				key: "hideThinkingBlock",
				label: "Hide thinking",
				description: "Hide thinking in the transcript.",
				control: { kind: "switch" },
			},
			{
				key: "showCacheMissNotices",
				label: "Cache miss notices",
				description: "Show cache costs and provider recovery notes.",
				control: { kind: "switch" },
			},
			{
				key: "images.autoResize",
				label: "Resize images",
				description: "Shrink images to 2000 by 2000 pixels before sending.",
				control: { kind: "switch" },
			},
			{
				key: "images.blockImages",
				label: "Block images",
				description: "Never send images to a model.",
				control: { kind: "switch" },
			},
		],
	},
	{
		title: "Shell and prompts",
		entries: [
			{
				key: "enableSkillCommands",
				label: "Skill commands",
				description: "Add each skill as a /skill:name command.",
				control: { kind: "switch" },
			},
			{
				key: "shellPath",
				label: "Shell path",
				description: "Path to the shell. Empty uses the system shell.",
				control: { kind: "text", placeholder: "/bin/zsh" },
			},
			{
				key: "shellCommandPrefix",
				label: "Shell command prefix",
				description: "Put before every shell command.",
				control: { kind: "text", placeholder: "source ~/.profile" },
			},
		],
	},
	{
		title: "Warnings, telemetry and trust",
		entries: [
			{
				key: "warnings",
				label: "Anthropic extra usage",
				description: "Warn when an Anthropic subscription may bill extra usage.",
				control: { kind: "warnings" },
			},
			{
				key: "enableInstallTelemetry",
				label: "Install telemetry",
				description: "Anonymous install and update reports.",
				control: { kind: "switch" },
			},
			{
				key: "enableAnalytics",
				label: "Analytics",
				description: "Share usage analytics.",
				control: { kind: "switch" },
			},
			{
				key: "defaultProjectTrust",
				label: "Default project trust",
				description: "Used when no extension or saved choice decides. Read from the agent home.",
				control: {
					kind: "select",
					options: [
						{ value: "ask", label: "Ask" },
						{ value: "always", label: "Always trust" },
						{ value: "never", label: "Never trust" },
					],
				},
			},
			{
				key: "treeFilterMode",
				label: "Tree filter",
				description: "Filter /tree opens with.",
				control: {
					kind: "select",
					options: [
						{ value: "default", label: "Default" },
						{ value: "no-tools", label: "No tool calls" },
						{ value: "user-only", label: "User messages" },
						{ value: "labeled-only", label: "Labeled only" },
						{ value: "all", label: "Everything" },
					],
				},
			},
		],
	},
];

/**
 * Settings that only mean something in a terminal. Each is listed read-only with
 * the sentence saying why, because hiding pi's surface would make it
 * undiscoverable and showing it enabled would lie.
 */
export const terminalEntries: readonly TerminalEntry[] = [
	{ key: "theme", label: "Theme", reason: "A theme paints the terminal's own interface." },
	{
		key: "tuiMode",
		label: "Interface mode",
		reason: "Fullscreen drawing is the terminal's screen, not the browser's.",
	},
	{
		key: "fullscreenExitOutput",
		label: "Fullscreen exit output",
		reason: "Controls what the terminal prints on exit.",
	},
	{
		key: "fullscreenScrollbar",
		label: "Fullscreen scrollbar",
		reason: "The terminal draws its own scrollbar.",
	},
	{
		key: "fullscreenCopyOnSelect",
		label: "Copy on select",
		reason: "Selection belongs to the terminal emulator.",
	},
	{
		key: "fullscreenWheelScrollLines",
		label: "Wheel scroll",
		reason: "The wheel is the terminal's input, with no browser equivalent.",
	},
	{
		key: "showHardwareCursor",
		label: "Hardware cursor",
		reason: "Cursor drawing is the terminal's.",
	},
	{
		key: "editorPaddingX",
		label: "Editor padding",
		reason: "Terminal editor padding.",
	},
	{
		key: "outputPad",
		label: "Output padding",
		reason: "It is a terminal layout, not a page layout.",
	},
	{
		key: "autocompleteMaxVisible",
		label: "Autocomplete rows",
		reason: "The terminal's autocomplete popup sizes itself.",
	},
	{
		key: "terminal.showTerminalProgress",
		label: "Terminal progress",
		reason: "Progress is drawn in the terminal's title or status area.",
	},
	{
		key: "terminal.clearOnShrink",
		label: "Clear on shrink",
		reason: "It is terminal repaint behaviour.",
	},
	{
		key: "terminal.showImages",
		label: "Terminal images",
		reason: "Terminal image drawing.",
	},
	{
		key: "terminal.imageWidthCells",
		label: "Image width",
		reason: "Image width is measured in terminal cells.",
	},
	{
		key: "markdown.mermaid",
		label: "Mermaid diagrams",
		reason: "Mermaid rendering is the terminal's image path.",
	},
	{
		key: "quietStartup",
		label: "Quiet startup",
		reason: "It silences the terminal's own startup banner.",
	},
	{
		key: "collapseChangelog",
		label: "Collapse changelog",
		reason: "Collapses the changelog the terminal prints.",
	},
	{
		key: "doubleEscapeAction",
		label: "Double-escape action",
		reason: "Escape is bound in the terminal's editor.",
	},
];
