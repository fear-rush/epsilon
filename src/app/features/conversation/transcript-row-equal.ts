import { toolRunOf } from "#domain/conversation/selectors";
import type { ConversationState, ToolRun } from "#domain/conversation/state";
import type { AssistantEntry } from "#protocol/conversation/frames";

import type { TranscriptRow } from "./transcript-rows";

/**
 * When a row's props mean the same picture. A row is drawn from its entry, the tool runs of
 * its own calls, whether thinking is hidden and which of its own cards are open; `state`
 * and `toolOpen` change with every streamed token or every other card, so comparing them
 * whole would redraw every settled row. `transcript()` also builds a fresh row object on
 * each call, so rows are compared by what they hold, not by identity.
 */
type RowProps = {
	readonly row: TranscriptRow;
	readonly state: ConversationState;
	readonly toolOpen: ReadonlyMap<string, boolean>;
	readonly onToggleTool: (toolCallId: string) => void;
};

type AssistantRowProps = {
	readonly entry: AssistantEntry;
	readonly state: ConversationState;
	readonly toolOpen: ReadonlyMap<string, boolean>;
	readonly onToggleTool: (toolCallId: string) => void;
};

/** Two runs of one tool call that show the same card. */
const sameRun = (left: ToolRun | undefined, right: ToolRun | undefined): boolean => {
	if (left === right) return true;
	if (left === undefined || right === undefined) return false;
	return (
		left.toolCallId === right.toolCallId &&
		left.status === right.status &&
		left.output === right.output &&
		left.args === right.args &&
		left.images === right.images &&
		left.durationMs === right.durationMs &&
		left.note === right.note &&
		left.children.length === right.children.length &&
		left.children.every((child, index) => sameRun(child, right.children[index]))
	);
};

const callIds = (entry: AssistantEntry): ReadonlyArray<string> =>
	entry.blocks.flatMap((block) => (block.type === "toolCall" ? [block.toolCallId] : []));

/** An assistant message: its entry, its calls' runs and open cards, and the thinking switch. */
export const assistantRowPropsEqual = (
	left: AssistantRowProps,
	right: AssistantRowProps,
): boolean => {
	if (left.entry !== right.entry || left.onToggleTool !== right.onToggleTool) return false;
	if (
		left.state.hideThinking !== right.state.hideThinking ||
		left.state.hiddenThinkingLabel !== right.state.hiddenThinkingLabel
	) {
		return false;
	}
	return callIds(left.entry).every(
		(id) =>
			left.toolOpen.get(id) === right.toolOpen.get(id) &&
			sameRun(toolRunOf(left.state, id), toolRunOf(right.state, id)),
	);
};

/** Any row: a settled one is equal across every token the streaming row receives. */
export const rowPropsEqual = (left: RowProps, right: RowProps): boolean => {
	if (left.onToggleTool !== right.onToggleTool) return false;
	const before = left.row;
	const after = right.row;
	if (before.id !== after.id || before.kind !== after.kind) return false;
	if (before.kind === "streaming" && after.kind === "streaming") return before.turn === after.turn;
	if (before.kind === "run" && after.kind === "run") {
		return (
			before.running === after.running &&
			before.failed === after.failed &&
			before.steps.length === after.steps.length &&
			before.steps.every((step, index) => {
				const other = after.steps[index];
				return (
					other !== undefined &&
					step.entryId === other.entryId &&
					step.call === other.call &&
					step.thinking === other.thinking &&
					sameRun(step.run, other.run) &&
					left.toolOpen.get(step.call.toolCallId) === right.toolOpen.get(step.call.toolCallId)
				);
			})
		);
	}
	if (before.kind !== "entry" || after.kind !== "entry" || before.entry !== after.entry) {
		return false;
	}
	const { entry } = before;
	if (entry.role === "assistant") {
		return assistantRowPropsEqual({ ...left, entry }, { ...right, entry });
	}
	if (entry.role === "toolResult") {
		return (
			(toolRunOf(left.state, entry.toolCallId) === undefined) ===
			(toolRunOf(right.state, entry.toolCallId) === undefined)
		);
	}
	return true;
};
