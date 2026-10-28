/**
 * REST reads for the session list. Responses are parsed with the shared zod
 * schemas, so a server change that the client cannot read is an error the page
 * shows, never a blank list.
 */
import { sessionErrorSchema, sessionListSchema } from "shared";
import type { SessionList } from "shared";

const OFFLINE = "The server is not reachable. Retrying…";

/** A dropped connection is a phrase, not the browser's "Failed to fetch". */
const request = async (input: string, init?: RequestInit): Promise<Response> => {
	try {
		return await fetch(input, init);
	} catch {
		throw new Error(OFFLINE);
	}
};

export async function fetchSessions(): Promise<SessionList> {
	const response = await request("/api/sessions");
	if (!response.ok) throw new Error(`The session list did not load (${response.status}).`);
	const parsed = sessionListSchema.safeParse(await response.json());
	if (!parsed.success) throw new Error("The server sent a session list this page cannot read.");
	return parsed.data;
}

export async function deleteSession(id: string): Promise<void> {
	const response = await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
	if (response.ok) return;
	const parsed = sessionErrorSchema.safeParse(await response.json().catch(() => null));
	throw new Error(parsed.success ? parsed.data.message : `Delete failed (${response.status}).`);
}
