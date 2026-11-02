/**
 * `reduce(state, frame)`: the one place that turns socket frames into what the
 * browser shows. Pure: no clock, no randomness, no I/O, so a recorded fixture
 * replays to an identical state.
 *
 * pi's event half lives in `events.ts`; this file owns the frame vocabulary.
 * The wire contract decides the shape: `message_start` gives the initial message,
 * deltas build on it, and `message_end` is authoritative.
 */
import type { ServerFrame } from "../protocol/frames";

import { reanchorNotices, reduceEvent, toolsFromMessages, withNotice } from "./events";
import { isVisibleMessage } from "./state";
import type { ConversationState, Notice, UiStatus, UiWidget } from "./state";

/**
 * An extension's `notify` severity decides the notice's appearance, so an `error`
 * from an extension reads like an error instead of a status line. pi's default
 * when an extension passes no type is `info`, which is an ordinary notice.
 */
const notifyKind = (severity: "info" | "warning" | "error" | undefined): Notice["kind"] => {
	if (severity === "error") return "error";
	if (severity === "warning") return "warning";
	return "notice";
};

/** The five display-only extension methods. None of them waits for an answer. */
const reduceDisplay = (
	state: ConversationState,
	request: Extract<ServerFrame, { t: "ui" }>,
): ConversationState => {
	const frame = request.request;
	switch (frame.method) {
		case "setStatus": {
			const statuses = state.statuses.filter((status) => status.key !== frame.statusKey);
			if (frame.statusText === undefined) return { ...state, statuses };
			const next: UiStatus = { key: frame.statusKey, text: frame.statusText };
			return { ...state, statuses: [...statuses, next] };
		}
		case "setWidget": {
			const widgets = state.widgets.filter((widget) => widget.key !== frame.widgetKey);
			if (frame.widgetLines === undefined) return { ...state, widgets };
			const next: UiWidget = {
				key: frame.widgetKey,
				placement: frame.widgetPlacement ?? "aboveEditor",
				lines: frame.widgetLines,
			};
			return { ...state, widgets: [...widgets, next] };
		}
		case "setTitle":
			return { ...state, title: frame.title };
		case "notify":
			return withNotice(state, notifyKind(frame.notifyType), frame.message);
		case "set_editor_text":
			return withNotice(
				state,
				"notice",
				"An extension tried to fill the composer: not supported here.",
			);
	}
};

export const reduce = (state: ConversationState, frame: ServerFrame): ConversationState => {
	switch (frame.t) {
		case "snapshot": {
			// A snapshot replaces the transcript: that is what makes reconnect and a
			// second tab safe. Dialogs stay, because they come from their own frames.
			const messages = frame.snapshot.messages.filter(isVisibleMessage);
			const current = frame.snapshot.state.model;
			return {
				...state,
				messages,
				// The snapshot may hold a shorter history than the notices were placed
				// in, so their anchors move to where the history was rebuilt.
				notices: reanchorNotices(state.notices, messages),
				tools: toolsFromMessages(messages),
				streaming: null,
				// Attaching mid-run must show the run as live, not as idle until the next
				// `agent_start`, which has already happened.
				busy: frame.snapshot.state.isStreaming,
				isCompacting: frame.snapshot.state.isCompacting,
				// A snapshot is the engine's own read of the file; whatever drifted is gone.
				drift: undefined,
				models: frame.snapshot.models,
				commands: frame.snapshot.commands,
				sessionName: frame.snapshot.state.sessionName,
				thinkingLevel: frame.snapshot.state.thinkingLevel,
				availableThinkingLevels: frame.snapshot.state.availableThinkingLevels,
				place: frame.snapshot.state.place,
				hideThinkingBlock: frame.snapshot.state.hideThinkingBlock,
				codingTools: frame.snapshot.state.codingTools,
				contextUsage: frame.snapshot.state.contextUsage,
				stats: frame.snapshot.state.stats,
				isRetrying: frame.snapshot.state.isRetrying,
				isBashRunning: frame.snapshot.state.isBashRunning,
				// A snapshot is the engine's own read, so it also ends any run this tab
				// was following the output of.
				bash: null,
				autoCompaction: frame.snapshot.state.autoCompaction,
				autoRetry: frame.snapshot.state.autoRetry,
				queue: frame.snapshot.state.queue,
				tree: frame.snapshot.state.tree,
				model:
					current === undefined
						? undefined
						: { provider: current.provider, id: current.id, name: current.name },
			};
		}
		case "event":
			return reduceEvent(state, frame.event);
		case "dialog": {
			const dialogs = state.dialogs.filter((dialog) => dialog.id !== frame.request.id);
			return { ...state, dialogs: [...dialogs, frame.request] };
		}
		case "dialog-closed":
			return {
				...state,
				dialogs: state.dialogs.filter((dialog) => dialog.id !== frame.id),
			};
		case "ui":
			return reduceDisplay(state, frame);
		case "notice":
			return {
				...withNotice(state, "notice", frame.text),
				// Only a change on disk raises the reload offer; a command's own sentence
				// has nothing to reload.
				drift: frame.kind === "external-change" ? frame.text : state.drift,
			};
		case "command-result":
			// A command the engine refused must not vanish. The frame names it, so
			// the notice can too.
			return frame.ok
				? state
				: withNotice(
						state,
						"notice",
						`${frame.command}: ${frame.error ?? "the agent rejected the command"}`,
					);
		case "error":
			return withNotice(state, "error", `${frame.code}: ${frame.message}`);
		case "session-replaced":
			// The page follows the new id; the transcript shown here belongs to the
			// session that was replaced, so nothing in it changes.
			return state;
		default:
			return state;
	}
};
