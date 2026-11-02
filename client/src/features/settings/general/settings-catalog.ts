/**
 * The panel's words around pi's settings keys. The read supplies each value and
 * the layer that set it; this file says what the value means, which control shows
 * it, and, for a key only a terminal can apply, why. pi's own labels and sentences
 * are reused where its settings menu has them, so the page and the terminal name
 * one setting the same way.
 */
import { THINKING_LEVELS, THINKING_LEVEL_LABELS } from "../providers/reasoning";

export type SettingOption = { value: string; label: string };

/** How a key's value is shown and written. */
type SettingControl =
	| { kind: "switch" }
	| { kind: "select"; options: readonly SettingOption[] }
	| { kind: "text"; placeholder?: string }
	| { kind: "number" }
	| { kind: "levels" }
	| { kind: "warnings" };

export type SettingEntry = {
	/** pi's key path, which is also the read's `key`. */
	key: string;
	label: string;
	description: string;
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
		title: "Thinking",
		description: "How much the model thinks when a chat does not say otherwise.",
		entries: [
			{
				key: "defaultThinkingLevel",
				label: "Default thinking level",
				description: "The level a model uses when it has no override of its own.",
				control: { kind: "select", options: thinkingOptions },
			},
			{
				key: "modelThinkingLevels",
				label: "Per-model thinking level",
				description: "Override the default level for one model.",
				control: { kind: "levels" },
			},
		],
	},
	{
		title: "Requests",
		entries: [
			{
				key: "transport",
				label: "Transport",
				description: "The preferred transport for a provider that offers more than one.",
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
				description:
					"Maximum idle gap while waiting for HTTP headers or body chunks, in milliseconds. 0 waits forever, for a local model that pauses longer than five minutes.",
				control: { kind: "number" },
			},
			{
				key: "cacheWarming",
				label: "Cache warming",
				description:
					"Off, streaming while the agent runs, or idle between runs while continuation stays profitable.",
				control: {
					kind: "select",
					options: [
						{ value: "off", label: "Off" },
						{ value: "streaming", label: "While streaming" },
						{ value: "idle", label: "Idle too" },
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
				description: "Hide thinking blocks in assistant responses.",
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
				description: "Shrink a large image before it reaches the model.",
				control: { kind: "switch" },
			},
			{
				key: "images.blockImages",
				label: "Block images",
				description: "Never send an image to a model.",
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
				description: "Offer each skill as a slash command in the palette.",
				control: { kind: "switch" },
			},
			{
				key: "shellPath",
				label: "Shell path",
				description: "The shell pi runs commands with. Empty uses the system default.",
				control: { kind: "text", placeholder: "/bin/zsh" },
			},
			{
				key: "shellCommandPrefix",
				label: "Shell command prefix",
				description: "Text prepended to every command pi runs, such as an environment setup.",
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
				description: "Warn when a Claude subscription starts billing as extra usage.",
				control: { kind: "warnings" },
			},
			{
				key: "enableInstallTelemetry",
				label: "Install telemetry",
				description: "Send an anonymous version ping after a changelog-detected update.",
				control: { kind: "switch" },
			},
			{
				key: "enableAnalytics",
				label: "Analytics",
				description: "Send anonymous usage counts for this installation.",
				control: { kind: "switch" },
			},
			{
				key: "defaultProjectTrust",
				label: "Default project trust",
				description:
					"The fallback when no saved decision or extension decides whether a folder is trusted.",
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
				description: "The filter a new /tree view starts with.",
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
