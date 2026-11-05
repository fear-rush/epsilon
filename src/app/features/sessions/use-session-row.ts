import { findSessionRow, useSessionList } from "./list.ts";
import type { SessionSummary } from "./list.ts";

/**
 * One chat from the shared list, whether it is Epsilon's own or a project's.
 *
 * The list is already in the query cache, so this adds no request; a chat whose folder is
 * gone still has its row, which is what the page's gate reads.
 */
export function useSessionRow(sessionId: string): SessionSummary | undefined {
	return findSessionRow(useSessionList().data, sessionId);
}
