import type { SessionSummary } from "@/api/types";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const RECENT_DAYS = 7;

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** "3 minutes ago" for the last week, a full date after that. */
export function formatWhen(iso: string): string {
	const when = new Date(iso);
	const elapsed = Date.now() - when.getTime();
	if (elapsed < HOUR_MS) return relative.format(-Math.round(elapsed / MINUTE_MS), "minute");
	if (elapsed < DAY_MS) return relative.format(-Math.round(elapsed / HOUR_MS), "hour");
	if (elapsed < RECENT_DAYS * DAY_MS) return relative.format(-Math.round(elapsed / DAY_MS), "day");
	return absolute.format(when);
}

/** The first line of the first user message, or the name the user set. */
export const sessionLabel = (session: Pick<SessionSummary, "name" | "firstMessage">): string => {
	if (session.name !== undefined) return session.name;
	const firstLine = session.firstMessage.split("\n")[0]?.trim() ?? "";
	return firstLine === "" ? "Untitled chat" : firstLine;
};
