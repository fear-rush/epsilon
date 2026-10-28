/**
 * sessionId → live child. The sessions on disk are pi's; this is only a cache
 * of children we have already spawned, so a second tab does not pay for a
 * second process (ADR-0001).
 */
import { AgentSession } from "./session";

/** Where a child runs and which pi config it reads, from `config.ts` once. */
export type AgentLocation = { cwd: string; agentHome: string };

export class SessionRegistry {
	private readonly location: AgentLocation;
	private readonly sessions = new Map<string, AgentSession>();

	constructor(location: AgentLocation) {
		this.location = location;
	}

	find(sessionId: string): AgentSession | undefined {
		const session = this.sessions.get(sessionId);
		return session?.isRunning === true ? session : undefined;
	}

	/** Every session this server holds a live child for, for the list badges. */
	live(): { id: string; needsInput: boolean }[] {
		return [...this.sessions.values()]
			.filter((session) => session.isRunning)
			.map((session) => ({ id: session.sessionId, needsInput: session.needsInput }));
	}

	/** The live child for this session, or a fresh one if it never existed or died. */
	ensure(sessionId: string): AgentSession {
		const existing = this.find(sessionId);
		if (existing !== undefined) return existing;
		const session = new AgentSession({ sessionId, ...this.location });
		this.sessions.set(sessionId, session);
		return session;
	}

	killAll(): void {
		for (const session of this.sessions.values()) session.kill();
		this.sessions.clear();
	}
}
