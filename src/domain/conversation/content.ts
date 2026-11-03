import type { AssistantEntry, TranscriptEntry } from "#protocol/conversation/frames";

/** The text of an assistant entry, thinking excluded: what a collapsed row shows. */
export function assistantText(entry: AssistantEntry): string {
	let text = "";
	for (const block of entry.blocks) {
		if (block.type === "text") text += block.text;
	}
	return text;
}

/** The thinking of an assistant entry, in the order it arrived. */
export function assistantThinking(entry: AssistantEntry): string {
	const parts: string[] = [];
	for (const block of entry.blocks) {
		if (block.type === "thinking") parts.push(block.thinking);
	}
	return parts.join("");
}

/** The tool calls an assistant entry made, in order. */
export function toolCallsOf(
	entry: AssistantEntry,
): ReadonlyArray<{ readonly toolCallId: string; readonly toolName: string }> {
	const calls: { toolCallId: string; toolName: string }[] = [];
	for (const block of entry.blocks) {
		if (block.type === "toolCall") {
			calls.push({ toolCallId: block.toolCallId, toolName: block.toolName });
		}
	}
	return calls;
}

/** One line of text for a tree row or a search result. */
export function entryLabel(entry: TranscriptEntry): string {
	switch (entry.role) {
		case "user":
			return entry.text;
		case "assistant":
			return assistantText(entry) || assistantThinking(entry) || "[assistant]";
		case "toolResult":
			return entry.output;
		default: {
			const unreachable: never = entry;
			return unreachable;
		}
	}
}
