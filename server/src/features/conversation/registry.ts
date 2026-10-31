/**
 * sessionId → live engine. The sessions on disk are pi's; this is only a cache
 * of engines already built, so a second tab does not create a second one.
 *
 * Creation is async, so a concurrent attach awaits the same promise instead of
 * opening a second writer on one session file.
 *
 * The folder a session runs in is pi's record in its file. Only a session with
 * no file yet takes its place from the tab, and a project folder must be trusted
 * in pi's store before an engine is built there (docs/DECISIONS.md, Chats and
 * projects).
 */
import { mkdir } from "node:fs/promises";

import type { Place } from "shared";

import type { AgentHome } from "../../platform/agent-home";
import { locateSession } from "../../platform/pi";
import type { McpLive } from "../mcp";
import { aggregateMcpLive } from "../mcp";
import { placeOf, trustedProjectFolder } from "../projects";
import { LiveSession } from "./session";
import type { ExportedSession, ExportFormat } from "./session";

/** Where a session will run, resolved before its engine is built. */
type Location = { cwd: string; file: string | undefined; place: Place };

export class SessionRegistry {
	private readonly home: AgentHome;
	private readonly sessions = new Map<string, LiveSession>();
	private readonly loading = new Map<string, Promise<LiveSession>>();

	constructor(home: AgentHome) {
		this.home = home;
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

	/**
	 * The engine for this session, or a new one built from the session file. `place`
	 * is read only for a session that has no file yet.
	 */
	async ensure(sessionId: string, place?: Place): Promise<LiveSession> {
		const existing = this.find(sessionId);
		if (existing !== undefined) return existing;
		const loading = this.loading.get(sessionId);
		if (loading !== undefined) return loading;
		const created = this.create(sessionId, place);
		this.loading.set(sessionId, created);
		try {
			return await created;
		} finally {
			this.loading.delete(sessionId);
		}
	}

	/**
	 * Drop an idle engine so its file can change underneath. Answers false while
	 * the session is still working; a session with no engine is already closed.
	 */
	closeIfIdle(sessionId: string): boolean {
		return this.sessions.get(sessionId)?.closeIfIdle() ?? true;
	}

	/**
	 * Write one chat's transcript through pi's exporter, which is a method on the
	 * live engine: a chat the registry does not hold is opened for the export and
	 * released back to its idle grace afterwards. Undefined means neither an engine
	 * nor pi's list has this session.
	 */
	async export(sessionId: string, format: ExportFormat): Promise<ExportedSession | undefined> {
		if (this.find(sessionId) === undefined && (await locateSession(sessionId)) === undefined) {
			return undefined;
		}
		const session = await this.ensure(sessionId);
		try {
			return await session.export(format);
		} finally {
			session.release();
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

	private async locate(sessionId: string, place: Place | undefined): Promise<Location> {
		const located = await locateSession(sessionId);
		if (located !== undefined && located.cwd === "") {
			throw new Error("This session predates pi recording its folder, so it has nowhere to run.");
		}
		if (located === undefined && place === undefined) {
			throw new Error("The agent home has no such session.");
		}
		const cwd = located?.cwd ?? (place?.kind === "project" ? place.path : this.home.chatsDir);
		const resolved = placeOf(cwd, this.home.chatsDir);
		if (resolved.kind === "chat") {
			await mkdir(this.home.chatsDir, { recursive: true });
			return { cwd, file: located?.file, place: resolved };
		}
		// A new project session runs in the real folder; an existing one in the
		// folder its file names. Either way the trust check sees the real path.
		const folder = await trustedProjectFolder(this.home, cwd);
		const where = located === undefined ? folder : cwd;
		return { cwd: where, file: located?.file, place: { kind: "project", path: where } };
	}

	private async create(sessionId: string, place: Place | undefined): Promise<LiveSession> {
		const location = await this.locate(sessionId, place);
		const session = await LiveSession.open({
			sessionId,
			...location,
			home: this.home,
			// The session disposed itself after the idle grace; drop the reference.
			onEmpty: () => this.sessions.delete(sessionId),
		});
		this.sessions.set(sessionId, session);
		return session;
	}
}
