import { Schema } from "effect";

import { DialogQuestion } from "#protocol/conversation/extui";
import type { ServerFrame, ToolResultEntry } from "#protocol/conversation/frames";

import {
	appendEntry,
	appendStreamingDelta,
	prependEntries,
	upsertTool,
	withNotice,
} from "./events.ts";
import type { ConversationState, ToolRun } from "./state.ts";

/**
 * `reduce(state, frame)`: the one place that turns socket frames into what the page shows.
 *
 * It is pure: no clock, no randomness, no I/O, so a recorded fixture replays to an
 * identical state. Every write is keyed by an id (`appendEntry`, `upsertTool`, `streamId`),
 * never by a position, which is what lets an older page arrive without renumbering what is
 * already on screen.
 */

const decodeDialog = Schema.decodeUnknownSync(DialogQuestion);

/** A tool run starts when its delta first names it and keeps the order it was first seen in. */
const toolFromDelta = (
	frame: Extract<ServerFrame, { t: "toolDelta" }>,
	existing: ToolRun | undefined,
): ToolRun => ({
	toolCallId: frame.toolCallId,
	toolName: frame.toolName,
	entryId: frame.entryId,
	args: existing?.args,
	output: frame.output ?? existing?.output ?? "",
	status: frame.status,
	durationMs: frame.durationMs ?? existing?.durationMs,
});

/** A tool result entry is authoritative for its run: it ends it and carries the output. */
const toolFromResult = (entry: ToolResultEntry, tools: ReadonlyArray<ToolRun>): ToolRun => {
	const existing = tools.find((tool) => tool.toolCallId === entry.toolCallId);
	return {
		toolCallId: entry.toolCallId,
		toolName: entry.toolName,
		entryId: existing?.entryId ?? entry.parentId ?? entry.id,
		args: existing?.args,
		output: entry.output,
		status: entry.isError ? "error" : "ok",
		durationMs: existing?.durationMs,
	};
};

const dropStreaming = (state: ConversationState, streamId: string): ConversationState => ({
	...state,
	streaming: state.streaming.filter((turn) => turn.streamId !== streamId),
});

export const reduce = (state: ConversationState, frame: ServerFrame): ConversationState => {
	switch (frame.t) {
		case "snapshot": {
			const tools: ToolRun[] = [];
			for (const entry of frame.entries) {
				if (entry.role === "toolResult") tools.push(toolFromResult(entry, tools));
			}
			return {
				...state,
				sessionId: frame.sessionId,
				entries: frame.entries,
				streaming: [],
				tools,
				notices: frame.notices,
				// The tree is on demand; a resync of the same chat keeps the one it has.
				tree: frame.sessionId === state.sessionId ? state.tree : [],
				hasOlder: frame.hasOlder,
				drift: undefined,
			};
		}
		case "tree":
			return { ...state, tree: frame.entries };
		case "prepend":
			return {
				...state,
				entries: prependEntries(state.entries, frame.entries),
				hasOlder: frame.hasOlder,
			};
		case "append": {
			const run =
				frame.entry.role === "toolResult" ? toolFromResult(frame.entry, state.tools) : undefined;
			const next: ConversationState = {
				...state,
				entries: appendEntry(state.entries, frame.entry),
				tools: run === undefined ? state.tools : upsertTool(state.tools, run),
			};
			return frame.streamId === undefined ? next : dropStreaming(next, frame.streamId);
		}
		case "streaming": {
			const existing = state.streaming.find((turn) => turn.streamId === frame.streamId);
			const turn = existing ?? { streamId: frame.streamId, blocks: [] };
			const updated = appendStreamingDelta(turn, frame.blockIndex, frame.kind, frame.delta);
			return existing === undefined
				? { ...state, streaming: [...state.streaming, updated] }
				: {
						...state,
						streaming: state.streaming.map((candidate) =>
							candidate.streamId === frame.streamId ? updated : candidate,
						),
					};
		}
		case "streamingEnd":
			return dropStreaming(state, frame.streamId);
		case "toolDelta": {
			const existing = state.tools.find((tool) => tool.toolCallId === frame.toolCallId);
			return { ...state, tools: upsertTool(state.tools, toolFromDelta(frame, existing)) };
		}
		case "notice":
			return withNotice(state, {
				id: frame.id,
				kind: frame.kind,
				text: frame.text,
				afterEntryId: state.entries.at(-1)?.id ?? null,
			});
		case "dialog": {
			const question = decodeDialog(frame.question);
			return {
				...state,
				dialogs: [...state.dialogs.filter((dialog) => dialog.id !== question.id), question],
			};
		}
		case "dialogClosed":
			return { ...state, dialogs: state.dialogs.filter((dialog) => dialog.id !== frame.id) };
		case "busy":
			return {
				...state,
				busy: frame.busy,
				compacting: frame.compacting ?? false,
				retrying: frame.retrying ?? false,
			};
		case "queue":
			return {
				...state,
				queue: { followUp: frame.followUp, steering: frame.steering },
			};
		case "drift":
			return { ...state, drift: frame.reason };
		case "sessionMeta":
			return {
				...state,
				sessionId: frame.sessionId,
				title: frame.title ?? state.title,
				model: frame.model ?? state.model,
				thinking: frame.thinking ?? state.thinking,
				activeTools: frame.tools ?? state.activeTools,
				autoCompaction: frame.autoCompaction ?? state.autoCompaction,
				autoRetry: frame.autoRetry ?? state.autoRetry,
				hideThinking: frame.hideThinking ?? state.hideThinking,
			};
		case "editorText":
			return { ...state, draft: { nonce: frame.nonce, text: frame.text } };
		default: {
			// Every frame is handled above; a new one must add a case, not fall through.
			const unreachable: never = frame;
			return unreachable;
		}
	}
};
