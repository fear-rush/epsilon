/**
 * One live engine session and the state the browser cannot rebuild by itself.
 * The transcript is pi's session file; the dialogs and display state live in
 * `dialogs.ts`, the fan-out to tabs in `frames.ts`, and what a command does in
 * `commands/`. A command is a method call on the embedded `AgentSession`
 * (docs/DECISIONS.md, Embedded engine); no process speaks to this one.
 *
 * The engine is a `SessionHost`, one pi `AgentSessionRuntime`. A replacement moves
 * the chat to a new session id, so the id is read live and a tab is told which one
 * it moved to; every id the chat held keeps reaching this object through the
 * registry.
 */
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type {
	Command,
	DialogAnswer,
	Place,
	ProtocolErrorCode,
	ServerFrame,
	SnapshotModel,
} from "shared";

import type { AgentHome } from "../../platform/agent-home";
import { globalSettings } from "../../platform/pi";
import type { McpLive } from "../mcp";
import { mcpLiveOf } from "../mcp";
import { runCommand } from "./commands";
import type { CommandTarget } from "./commands/context";
import { exportSession } from "./commands/export";
import type { ExportedSession, ExportFormat } from "./commands/export";
import { Dialogs } from "./dialogs";
import type { AnswerOutcome, FrameSink } from "./dialogs";
import { toJsonEvent } from "./engine";
import { SessionFrames } from "./frames";
import { bindHost } from "./host/bindings";
import { SessionHost } from "./host/host";
import { buildSnapshot, readModelsFrom, shadowedCommandsOf } from "./snapshot";
import { UiBridge } from "./ui-context";
import { FileWatcher } from "./watcher";

/**
 * How long a session with no tab stays alive. A reload, a route change or a
 * phone locking the screen reattaches inside it; a run or a pending dialog keeps
 * the session alive for as long as it needs.
 */
const IDLE_DISPOSE_MS = 10_000;

/** pi's model scope for this home; null means every model is offered. */
const patternsOf = (home: AgentHome): string[] | null =>
	globalSettings(home).getEnabledModels() ?? null;

export type LiveSessionOptions = {
	sessionId: string;
	cwd: string;
	/** The session file, or undefined for a session pi has not written yet. */
	file: string | undefined;
	place: Place;
	home: AgentHome;
	/** Called once this session has disposed itself, so the registry drops it. */
	onEmpty: () => void;
	/** Called after a replacement that changed the id, so the registry re-keys. */
	onReplaced: (from: string, to: string) => void;
};

export class LiveSession {
	readonly place: Place;
	private readonly onEmpty: () => void;
	private readonly onReplaced: (from: string, to: string) => void;
	private readonly home: AgentHome;
	private readonly frames: SessionFrames;
	private readonly dialogs: Dialogs;
	private readonly bridge: UiBridge;
	private host: SessionHost | undefined;
	/** The id pi has for this chat now; a replacement changes it. */
	private currentId: string;
	private unsubscribe: (() => void) | undefined;
	/** True while a command runs, so a shutdown it asked for waits for it to finish. */
	private dispatching = false;
	/** The models the picker offers, refreshed when the engine's providers change. */
	private models: SnapshotModel[] = [];
	private idleTimer: ReturnType<typeof setTimeout> | undefined;
	/** The file as it was handed in, so a reload after an outside change reads it again. */
	private file: string | undefined;
	private readonly cwd: string;
	private readonly chat: boolean;
	private readonly files = new FileWatcher(
		() => this.host !== undefined && !this.busy,
		() =>
			this.notice(
				"This chat's file changed outside Epsilon. Reload to read what is on disk now.",
				"external-change",
			),
	);
	/** Shadowed command names already reported, so a resync does not repeat itself. */
	private readonly reportedShadowed = new Set<string>();

	private constructor(options: LiveSessionOptions) {
		const { sessionId, place, onEmpty, onReplaced, home } = options;
		this.currentId = sessionId;
		this.place = place;
		this.onEmpty = onEmpty;
		this.onReplaced = onReplaced;
		this.home = home;
		this.cwd = options.cwd;
		this.file = options.file;
		this.chat = place.kind === "chat";
		this.frames = new SessionFrames(() => this.onFrameCount());
		this.dialogs = new Dialogs(
			() => this.currentId,
			(frame) => this.frames.emit(frame),
			() => this.scheduleIdle(),
		);
		this.bridge = new UiBridge(
			this.dialogs,
			() => this.frames.count > 0,
			(error, code) => this.fail(error, code),
		);
	}

	static async open(options: LiveSessionOptions): Promise<LiveSession> {
		const session = new LiveSession(options);
		await session.start();
		return session;
	}

	/**
	 * Stable for the chat's life in a terminal's sense, but a replacement changes it;
	 * the registry keeps every id this chat has held pointing here.
	 */
	get sessionId(): string {
		return this.currentId;
	}

	/** Build the runtime, bind its extensions, and follow the file it writes. */
	private async start(): Promise<void> {
		const host = await SessionHost.open({
			home: this.home,
			cwd: this.cwd,
			sessionId: this.currentId,
			file: this.file,
			chat: this.chat,
		});
		this.host = host;
		await this.wire(host);
	}

	/**
	 * Bind one host: the extensions first, so every replacement binds the new session
	 * before this owner re-subscribes to it, then the observations this session keeps.
	 */
	private async wire(host: SessionHost): Promise<void> {
		await bindHost(host, this.bridge.host);
		host.onSwap((session) => this.rebound(session));
		host.onReplaced(({ from, to }) => this.onReplaced(from, to));
		host.onShutdownRequested(() => this.extensionShutdown());
		this.subscribeTo(host.session);
		this.currentId = host.id;
		this.file = host.file;
		this.models = (await readModelsFrom(host.session.modelRuntime, patternsOf(this.home))).scoped;
		this.watch();
		this.reportShadowed();
	}

	/**
	 * pi swapped the session under this host. Subscriptions and the watcher belong to
	 * the session that went; a new id is what the tab has to follow.
	 */
	private rebound(session: AgentSession): void {
		const host = this.host;
		if (host === undefined) return;
		const from = this.currentId;
		this.subscribeTo(session);
		this.currentId = host.id;
		this.file = host.file;
		this.files.clearDrift();
		this.watch();
		this.reportShadowed();
		if (host.id !== from) {
			this.emit({
				t: "session-replaced",
				sessionId: from,
				fromId: from,
				toId: host.id,
				reason: host.startReason,
			});
		}
		this.resync();
		// The same catalog serves every session in this home, so the picker keeps its
		// list while the auth-checked read runs; the swap itself must not wait for it.
		void this.refreshModels(session);
	}

	private async refreshModels(session: AgentSession): Promise<void> {
		try {
			this.models = (await readModelsFrom(session.modelRuntime, patternsOf(this.home))).scoped;
			this.resync();
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/** Replace the event subscription; the old session's listener is gone with it. */
	private subscribeTo(session: AgentSession): void {
		this.unsubscribe?.();
		this.unsubscribe = session.subscribe((event) => this.receive(event));
	}

	get isOpen(): boolean {
		return this.host !== undefined;
	}

	get needsInput(): boolean {
		return this.dialogs.needsInput;
	}

	/**
	 * Drop the engine now if nothing would be lost: no run, no compaction, no
	 * question waiting. Answers whether it is gone, so a move or a delete can
	 * refuse a session that is still working. Awaits the close, because the caller
	 * may delete or re-read the file the engine holds.
	 */
	async closeIfIdle(): Promise<boolean> {
		if (this.busy) return false;
		await this.dispose();
		return true;
	}

	/**
	 * What this engine's MCP servers report through their tools. pi exposes no
	 * connection state, so a server appears here once it registered a tool and
	 * `sessions` is the only answer for "is anything connected yet".
	 */
	mcpLive(names: readonly string[]): McpLive {
		const agent = this.host?.session;
		if (agent === undefined)
			return { sessions: 0, servers: [], codemode: false, toolSearch: false };
		const tools: { namespace: string; name: string }[] = [];
		for (const tool of agent.getAllTools()) {
			const namespace = tool.namespace?.name;
			if (namespace !== undefined && namespace.startsWith("mcp__")) {
				tools.push({ namespace, name: tool.name });
			}
		}
		return mcpLiveOf({ names, tools, active: agent.getActiveToolNames() });
	}

	/**
	 * A late subscriber gets every unanswered dialog, the keyed display state and
	 * the snapshot, so a blocking dialog is never invisible.
	 */
	subscribe(sink: FrameSink): () => void {
		this.frames.add(sink);
		this.bridge.flush();
		for (const frame of this.frames.takeDeferred()) sink(frame);
		this.dialogs.replay(sink);
		sink(this.snapshotFrame());
		return () => this.frames.remove(sink);
	}

	answerDialog(answer: DialogAnswer): AnswerOutcome {
		return this.dialogs.answer(answer);
	}

	/** Rename through the live engine, so every tab watching gets the new snapshot. */
	rename(name: string): boolean {
		const agent = this.host?.session;
		if (agent === undefined) return false;
		agent.setSessionName(name);
		return true;
	}

	/**
	 * pi's own exporter, which only writes to a file: it runs into a scratch folder
	 * that is read back and removed, so the engine keeps nothing. The caller owns the
	 * engine, so nothing here disposes or releases it (docs/DECISIONS.md, Export).
	 */
	async export(format: ExportFormat): Promise<ExportedSession> {
		return exportSession(this.engine, this.sessionId, format);
	}

	/** Run one command and report it to every tab watching this session. */
	async run(command: Command): Promise<void> {
		this.dispatching = true;
		try {
			await this.dispatch(command);
			this.files.markOwnActivity();
			this.emit({
				t: "command-result",
				sessionId: this.sessionId,
				command: command.type,
				ok: true,
			});
		} catch (error) {
			this.emit({
				t: "command-result",
				sessionId: this.sessionId,
				command: command.type,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			this.dispatching = false;
			// An extension command can ask for shutdown; close only once it is done,
			// the way pi's own modes defer it.
			if (this.host?.shutdownRequested === true) this.closeIfSafe();
		}
	}

	/** Drop the engine. A later attach rebuilds it from the session file. */
	async dispose(): Promise<void> {
		this.files.stop();
		const host = this.host;
		if (host === undefined) return;
		// Clear the reference first: cancelling dialogs asks the session to
		// re-time itself, and a session with no engine must not schedule anything.
		this.host = undefined;
		if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
		this.idleTimer = undefined;
		this.dialogs.cancelAll();
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		// The runtime's dispose is the one teardown that emits `session_shutdown`;
		// a plain `session.dispose()` would leave MCP transports connected.
		await host.close();
		this.onEmpty();
	}

	/**
	 * An extension called `ctx.shutdown()`. pi names no extension, so the notice
	 * cannot either; the chat closes and the server keeps serving.
	 */
	private extensionShutdown(): void {
		this.dialogs.display({
			method: "notify",
			message:
				"An extension asked to close this chat, so its engine is closing. Every other chat keeps running; the next message reopens this one from its file.",
			notifyType: "warning",
		});
		this.closeIfSafe();
	}

	/** Close now unless a run, a question or the command that asked is still going. */
	private closeIfSafe(): void {
		if (this.busy || this.dispatching || this.host === undefined) return;
		void this.dispose();
	}

	/**
	 * Read the session file again after another process changed it. The engine is
	 * rebuilt from disk, which is the only honest way back: pi holds the transcript
	 * it loaded, so merging a file that grew underneath it would invent an order.
	 */
	async reloadFromDisk(): Promise<void> {
		if (this.busy) throw new Error("Stop the run before reloading this chat.");
		const host = this.host;
		if (host === undefined) return;
		this.files.stop();
		this.host = undefined;
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.files.clearDrift();
		await host.close();
		await this.start();
		this.resync();
	}

	/** Follow the file the live session writes, so an outside change is noticed. */
	private watch(): void {
		const file = this.host?.file ?? this.file;
		if (file === undefined) return;
		this.file = file;
		this.files.watch(file);
	}

	/**
	 * A built-in command took its name from an extension command, so the extension one
	 * cannot be reached from `/`. Say so once per name (invariant 8: no silent drop).
	 */
	private reportShadowed(): void {
		const host = this.host;
		if (host === undefined) return;
		for (const name of shadowedCommandsOf(host.session)) {
			if (this.reportedShadowed.has(name)) continue;
			this.reportedShadowed.add(name);
			this.notice(
				`An extension command named /${name} is shadowed by pi's built-in /${name}, so the built-in runs here.`,
				"command",
			);
		}
	}

	/**
	 * One sentence for the transcript, with the kind that decides what the row offers.
	 * A command can run before any tab is watching (the shadowing report is one), so a
	 * sentence nobody could receive waits for the next subscriber, as a failure does.
	 */
	private notice(text: string, kind: "external-change" | "command"): void {
		const frame: ServerFrame = { t: "notice", sessionId: this.sessionId, kind, text };
		if (this.frames.count === 0) this.frames.defer(frame);
		else this.frames.emit(frame);
	}

	/**
	 * A caller got this session from the registry and decided not to watch it. The
	 * registry shares one session between tabs, so this never disposes: it starts
	 * the idle countdown only when nobody is subscribed and nothing is running.
	 */
	release(): void {
		this.scheduleIdle();
	}

	private async dispatch(command: Command): Promise<void> {
		await runCommand(this.commandTarget(), command);
	}

	/**
	 * What one command may touch. Built per command, so the engine and the model
	 * list are the ones current when the tab's command ran.
	 */
	private commandTarget(): CommandTarget {
		return {
			agent: this.engine,
			host: this.liveHost,
			home: this.home,
			models: this.models,
			cancelDialogs: () => this.dialogs.cancelAll(),
			notice: (text) => this.notice(text, "command"),
			fail: (error) => this.fail(error),
			resync: () => this.resync(),
			reload: () => this.reload(),
			reloadFromDisk: () => this.reloadFromDisk(),
		};
	}

	/**
	 * Re-read extensions, skills, packages, MCP config and the model catalog in
	 * place. The session object and its transcript stay. Settings changes call it
	 * so a live tab sees what the settings panel just wrote.
	 */
	async reload(): Promise<void> {
		const agent = this.engine;
		await agent.reload();
		this.models = (await readModelsFrom(agent.modelRuntime, patternsOf(this.home))).scoped;
		// A reloaded resource set has its own palette, so a name can collide for the
		// first time here.
		this.reportShadowed();
		this.resync();
	}

	private get liveHost(): SessionHost {
		const host = this.host;
		if (host === undefined) throw new Error("This session has no live engine");
		return host;
	}

	private get engine(): AgentSession {
		return this.liveHost.session;
	}

	private fail(error: Error, code: ProtocolErrorCode = "AGENT_FAILED"): void {
		// A turn can fail with no tab watching, and an extension can fail while the
		// engine is being built. With no subscriber the frame waits for the next one.
		const frame: ServerFrame = {
			t: "error",
			code,
			message: error.message,
			sessionId: this.sessionId,
		};
		if (this.frames.count === 0) this.frames.defer(frame);
		else this.frames.emit(frame);
	}

	private receive(event: AgentSessionEvent): void {
		this.files.markOwnActivity();
		if (event.type === "agent_settled") {
			// Token totals, context usage and the queue all move with a run, so a
			// settled engine re-reads the snapshot once instead of leaving the tab on
			// numbers from its attach.
			this.resync();
			this.scheduleIdle();
			// pi writes the file on the first entry, so a new chat has nothing to
			// watch until a run settles.
			if (!this.files.watching) this.watch();
			// A shutdown asked for during the run waited for this settle.
			if (this.host?.shutdownRequested === true) this.closeIfSafe();
		}
		try {
			this.emit({ t: "event", sessionId: this.sessionId, event: toJsonEvent(event) });
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
			return;
		}
		// A rename reaches the session file and the event, but the sidebar reads
		// the snapshot, so refresh it.
		if (event.type === "session_info_changed") this.resync();
	}

	private snapshotFrame(): ServerFrame {
		return {
			t: "snapshot",
			sessionId: this.sessionId,
			snapshot: buildSnapshot(this.engine, this.models, this.place),
		};
	}

	/** Re-read the snapshot for everyone watching, after the engine changed. */
	private resync(): void {
		if (!this.isOpen) return;
		this.frames.emit(this.snapshotFrame());
	}

	/** Keep an unwatched session while it runs, waits for an answer, retries or compacts. */
	private get busy(): boolean {
		const agent = this.host?.session;
		return (
			agent !== undefined &&
			(agent.isStreaming || agent.isCompacting || agent.isRetrying || this.dialogs.needsInput)
		);
	}

	/** The tab count changed: cancel the countdown, or start one once it is zero. */
	private onFrameCount(): void {
		if (this.frames.count > 0) {
			if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
			this.idleTimer = undefined;
			return;
		}
		this.scheduleIdle();
	}

	private scheduleIdle(): void {
		if (this.host === undefined || this.frames.count > 0 || this.busy) return;
		if (this.idleTimer !== undefined) return;
		this.idleTimer = setTimeout(() => void this.dispose(), IDLE_DISPOSE_MS);
	}

	private emit(frame: ServerFrame): void {
		this.frames.emit(frame);
	}
}
