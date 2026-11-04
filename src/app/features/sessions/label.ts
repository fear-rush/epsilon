import type { SessionSummary } from "#protocol/sessions";

/** pi's own name first, then the first message, then a placeholder that still links. */
export function labelOf(session: SessionSummary): string {
	const name = session.name ?? "";
	if (name.trim() !== "") return name;
	const first = session.firstMessage.trim();
	return first === "" ? "New chat" : first;
}
