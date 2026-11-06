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
		description: "What pi does with a message sent while it is still working.",
		entries: [
			{
				key: "steeringMode",
				label: "Steering mode",
				description:
					"A message sent while streaming changes the run. One at a time delivers one and waits; all delivers them at once.",
				control: { kind: "select", options: queueModeOptions },
			},
			{
				key: "followUpMode",
				label: "Follow-up mode",
				description:
					"A message sent after the run starts waits until the agent stops. One at a time delivers one and waits; all delivers them at once.",
				control: { kind: "select", options: queueModeOptions },
			},
		],
	},
	{
		title: "Compaction",
		description: "How pi summarises the context when it nears the window.",
		entries: [
			{
				key: "compaction.enabled",
				label: "Automatic compaction",
				control: { kind: "switch" },
			},
			{
				key: "compaction.reserveTokens",
				label: "Reserve tokens",
				description: "Free context tokens below which automatic compaction starts.",
				control: { kind: "number" },
			},
			{
				key: "compaction.keepRecentTokens",
				label: "Keep recent tokens",
				description: "Recent tokens retained without summarization.",
				control: { kind: "number" },
			},
			{
				key: "compaction.modelOverrides",
				label: "Per-model reserves",
				description:
					"Per-model token settings keyed by exact provider/modelId. A blank field uses the number above.",
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
				description: "Enable automatic agent-level retry for transient failures.",
				control: { kind: "switch" },
			},
			{
				key: "retry.maxRetries",
				label: "Max retries",
				description: "Maximum agent-level retry attempts.",
				control: { kind: "number" },
			},
			{
				key: "retry.baseDelayMs",
				label: "Base delay",
				description: "Initial exponential-backoff delay in milliseconds.",
				control: { kind: "number" },
			},
			{
				key: "retry.maxAgentDelayMs",
				label: "Longest delay",
				description: "Maximum agent-level retry delay in milliseconds.",
				control: { kind: "number" },
			},
		],
	},
	{
		title: "Branch summaries",
		description: "What pi writes when it branches from earlier history.",
		entries: [
			{
				key: "branchSummary.reserveTokens",
				label: "Reserve tokens",
				description: "Tokens reserved when summarizing branch history.",
				control: { kind: "number" },
			},
			{
				key: "branchSummary.skipPrompt",
				label: "Skip the prompt",
				description: "Skip the branch-summary prompt and default to no summary.",
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
				description: "The thinking level a model starts at.",
				control: { kind: "select", options: thinkingOptions },
			},
			{
				key: "modelThinkingLevels",
				label: "Per-model thinking level",
				description: "Per-model startup thinking levels keyed by exact provider/modelId.",
				control: { kind: "levels" },
			},
			{
				key: "enabledModels",
				label: "Enabled models",
				description:
					"Model patterns used for startup selection and model cycling, the same format as --models. Empty offers every model; a chat keeps the model it is already using.",
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
				description: "Preferred transport for AI providers that support multiple transports.",
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
				description: "HTTP header and body idle timeout in milliseconds. Set to 0 to disable.",
				control: { kind: "number" },
			},
			{
				key: "cacheWarming",
				label: "Cache warming",
				description:
					"Keep eligible provider prompt caches warm during active runs or, with idle, between runs. The agent home's value is the one pi reads.",
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
				description: "Hide thinking blocks in the transcript.",
				control: { kind: "switch" },
			},
			{
				key: "showCacheMissNotices",
				label: "Cache miss notices",
				description: "Show transcript notices for cache costs and provider recovery diagnostics.",
				control: { kind: "switch" },
			},
			{
				key: "images.autoResize",
				label: "Resize images",
				description: "Resize images to at most 2000 by 2000 pixels before sending them to a model.",
				control: { kind: "switch" },
			},
			{
				key: "images.blockImages",
				label: "Block images",
				description: "Prevent images from being sent to models.",
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
				description: "Register skills as /skill:name commands.",
				control: { kind: "switch" },
			},
			{
				key: "shellPath",
				label: "Shell path",
				description:
					"Custom shell executable path. Supports a leading ~. Empty uses the system default.",
				control: { kind: "text", placeholder: "/bin/zsh" },
			},
			{
				key: "shellCommandPrefix",
				label: "Shell command prefix",
				description: "Prefix prepended to every shell command.",
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
				description: "Warn when Anthropic subscription authentication may use paid extra usage.",
				control: { kind: "warnings" },
			},
			{
				key: "enableInstallTelemetry",
				label: "Install telemetry",
				description:
					"Enable anonymous install/update reporting and selected provider attribution headers.",
				control: { kind: "switch" },
			},
			{
				key: "enableAnalytics",
				label: "Analytics",
				description: "Opt in to analytics data sharing.",
				control: { kind: "switch" },
			},
			{
				key: "defaultProjectTrust",
				label: "Default project trust",
				description:
					"Fallback behavior when no extension or saved trust decision decides project trust. The agent home's value is the one pi reads.",
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
				description: "Default filter when opening /tree.",
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
		reason: "It decides what the terminal prints when the fullscreen view closes.",
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
		reason: "Padding inside the terminal editor has no browser equivalent.",
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
		reason: "Images are drawn with terminal graphics protocols.",
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
		reason: "It collapses the changelog the terminal prints on start.",
	},
	{
		key: "doubleEscapeAction",
		label: "Double-escape action",
		reason: "Escape is bound in the terminal's editor.",
	},
];
