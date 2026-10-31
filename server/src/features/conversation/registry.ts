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

import type { AgentSessionRuntime } from "@earendil-works/pi-coding-agent";
import type { Place } from "shared";

import type { AgentHome } from "../../platform/agent-home";
import { locateSession } from "../../platform/pi";
import type { LocatedSession } from "../../platform/pi";
import type { McpLive } from "../mcp";
import { aggregateMcpLive } from "../mcp";
import { placeOf, trustedProjectFolder } from "../projects";
import { withRuntime } from "./runtime";
import { LiveSession } from "./session";
import type { ExportedSession, ExportFormat } from "./session";

/** Where a session will run, resolved before its engine is built. */
type Location = { cwd: string; file: string | undefined; place: Place };

/**
 * What a copy answers: the new session's id, or why pi made no copy. Only a refusal
 * of the copy itself carries a sentence — that one is pi's — while a missing or busy
 * session is a reason the caller already has words for.
 */
export type CopyOutcome =
	| { ok: true; id: string }
	| { ok: false; reason: "session-not-found" }
	| { ok: false; reason: "session-running" }
	| { ok: false; reason: "copy-refused"; message: string };

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

	/**
	 * pi's fork: a new session holding the history up to `entryId`. A user message
	 * forks before itself, so the copy starts from the message picked and the
	 * original file is left as it was. The new id is what the page opens next.
	 */
	async fork(sessionId: string, entryId: string): Promise<CopyOutcome> {
		return this.copy(sessionId, async (runtime) => {
			const result = await runtime.fork(entryId);
			if (result.cancelled) throw new Error("An extension cancelled the fork.");
			return runtime.session.sessionId;
		});
	}

	/**
	 * Clone: a new session holding the branch up to where this chat is now, which is
	 * pi's `fork` at the current entry (`{ position: "at" }`).
	 */
	async clone(sessionId: string): Promise<CopyOutcome> {
		return this.copy(sessionId, async (runtime) => {
			const leaf = runtime.session.sessionManager.getLeafId();
			if (leaf === null) throw new Error("This chat has no message to clone yet.");
			const result = await runtime.fork(leaf, { position: "at" });
			if (result.cancelled) throw new Error("An extension cancelled the clone.");
			return runtime.session.sessionId;
		});
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
		if (located !== undefined) return this.locationOf(located);
		if (place === undefined) throw new Error("The agent home has no such session.");
		const cwd = place.kind === "project" ? place.path : this.home.chatsDir;
		const resolved = placeOf(cwd, this.home.chatsDir);
		if (resolved.kind === "chat") {
			await mkdir(this.home.chatsDir, { recursive: true });
			return { cwd, file: undefined, place: resolved };
		}
		// A new project session runs in the real folder; the trust check sees that path.
		const folder = await trustedProjectFolder(this.home, cwd);
		return { cwd: folder, file: undefined, place: { kind: "project", path: folder } };
	}

	/**
	 * Where an existing session runs: the folder pi recorded in its file, which a
	 * project has to be trusted in. A copy reads the file from here too.
	 */
	private async locationOf(located: LocatedSession): Promise<Location> {
		if (located.cwd === "") {
			throw new Error("This session predates pi recording its folder, so it has nowhere to run.");
		}
		const place = placeOf(located.cwd, this.home.chatsDir);
		if (place.kind === "chat") {
			await mkdir(this.home.chatsDir, { recursive: true });
			return { cwd: located.cwd, file: located.file, place };
		}
		await trustedProjectFolder(this.home, located.cwd);
		return { cwd: located.cwd, file: located.file, place };
	}

	/**
	 * Make one copy of a session on a runtime of its own (docs/DECISIONS.md, Session
	 * copies). The engine on the source goes first, so pi reads the file with no
	 * second writer on it; a session that is working is refused rather than stopped.
	 */
	private async copy(
		sessionId: string,
		replace: (runtime: AgentSessionRuntime) => Promise<string>,
	): Promise<CopyOutcome> {
		const located = await locateSession(sessionId);
		if (located === undefined) return { ok: false, reason: "session-not-found" };
		if (!this.closeIfIdle(sessionId)) return { ok: false, reason: "session-running" };
		try {
			const location = await this.locationOf(located);
			if (location.file === undefined) {
				return {
					ok: false,
					reason: "copy-refused",
					message: "This chat has no session file yet. Send a message before copying it.",
				};
			}
			const id = await withRuntime(
				{
					home: this.home,
					cwd: location.cwd,
					chat: location.place.kind === "chat",
					file: location.file,
				},
				replace,
			);
			return { ok: true, id };
		} catch (error) {
			return {
				ok: false,
				reason: "copy-refused",
				message: error instanceof Error ? error.message : String(error),
			};
		}
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
