/**
 * sessionId → live engine. The sessions on disk are pi's; this is only a cache
 * of engines already built, so a second tab does not create a second one.
 *
 * Creation is async, so a concurrent attach awaits the same promise instead of
 * opening a second writer on one session file.
 */
import type { AgentHome } from "../../platform/agent-home";
import type { McpLive } from "../mcp";
import { aggregateMcpLive } from "../mcp";
import { LiveSession } from "./session";

/** Where a session runs and which pi config it reads, from `main.ts` once. */
export type AgentLocation = { cwd: string; home: AgentHome };

export class SessionRegistry {
	private readonly location: AgentLocation;
	private readonly sessions = new Map<string, LiveSession>();
	private readonly loading = new Map<string, Promise<LiveSession>>();

	constructor(location: AgentLocation) {
		this.location = location;
	}

	find(sessionId: string): LiveSession | undefined {
		const session = this.sessions.get(sessionId);
		return session?.isOpen === true ? session : undefined;
	}

	/**
	 * What the live engines can say about MCP: which servers registered tools and
	 * whether a reaching tool is active. A server is reported by its configured
	 * name, so the panel can match it to a row.
	 */
	mcpLive(names: readonly string[]): McpLive {
		const states: McpLive[] = [];
		for (const session of this.sessions.values()) {
			if (!session.isOpen) continue;
			try {
				states.push(session.mcpLive(names));
			} catch {
				// A session mid-reload answers on the next read; the panel must not fail
				// because one engine was rebuilding.
			}
		}
		return aggregateMcpLive(states);
	}

	/** Every session this server holds an engine for, for the list badges. */
	live(): { id: string; needsInput: boolean }[] {
		return [...this.sessions.values()]
			.filter((session) => session.isOpen)
			.map((session) => ({ id: session.sessionId, needsInput: session.needsInput }));
	}

	/** The engine for this session, or a new one built from the session file. */
	async ensure(sessionId: string): Promise<LiveSession> {
		const existing = this.find(sessionId);
		if (existing !== undefined) return existing;
		const loading = this.loading.get(sessionId);
		if (loading !== undefined) return loading;
		const created = this.create(sessionId);
		this.loading.set(sessionId, created);
		try {
			return await created;
		} finally {
			this.loading.delete(sessionId);
		}
	}

	/** Re-read config in every live engine, after the settings panel wrote it. */
	reloadAll(): void {
		for (const session of this.sessions.values()) {
			if (session.isOpen) void session.reload();
		}
	}

	disposeAll(): void {
		for (const session of [...this.sessions.values()]) session.dispose();
		this.sessions.clear();
	}

	private async create(sessionId: string): Promise<LiveSession> {
		const session = await LiveSession.open({
			sessionId,
			...this.location,
			// The session disposed itself after the idle grace; drop the reference.
			onEmpty: () => this.sessions.delete(sessionId),
		});
		this.sessions.set(sessionId, session);
		return session;
	}
}
