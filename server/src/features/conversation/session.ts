/**
 * One live engine session and the state the browser cannot rebuild by itself.
 * The transcript is pi's session file; the dialogs and display state live in
 * `dialogs.ts`, and the fan-out to tabs in `SessionFrames` below. A command is a method
 * call on the embedded `AgentSession` (docs/DECISIONS.md, Embedded engine); no process speaks to this one.
 */
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { Command, DialogAnswer, ProtocolErrorCode, ServerFrame, SnapshotModel } from "shared";

import type { AgentHome } from "../../platform/agent-home";
import type { McpLive } from "../mcp";
import { mcpLiveOf } from "../mcp";
import { Dialogs } from "./dialogs";
import type { AnswerOutcome, FrameSink } from "./dialogs";
import { createEngine, toJsonEvent } from "./engine";
import { buildSnapshot, readModelsFrom } from "./snapshot";
import { UiBridge } from "./ui-context";

/** A session with no tab keeps the last few frames worth showing on the next one. */
const MAX_DEFERRED = 5;

/**
 * The tabs watching one session. The session asks how many remain to decide its
 * idle lifetime, so this is the only place that counts them.
 */
export class SessionFrames {
	private readonly sinks = new Set<FrameSink>();
	private readonly deferred: ServerFrame[] = [];

	/** Called after every change, so the session can cancel or start its idle timer. */
	constructor(private readonly changed: () => void) {}

	get count(): number {
		return this.sinks.size;
	}

	add(sink: FrameSink): void {
		this.sinks.add(sink);
		this.changed();
	}

	remove(sink: FrameSink): void {
		this.sinks.delete(sink);
		this.changed();
	}

	/** A frame nobody could receive yet; kept for the next subscriber. */
	defer(frame: ServerFrame): void {
		if (this.deferred.length < MAX_DEFERRED) this.deferred.push(frame);
	}

	takeDeferred(): ServerFrame[] {
		return this.deferred.splice(0);
	}

	emit(frame: ServerFrame): void {
		for (const sink of this.sinks) sink(frame);
	}
}

/**
 * How long a session with no tab stays alive. A reload, a route change or a
 * phone locking the screen reattaches inside it; a run or a pending dialog keeps
 * the session alive for as long as it needs.
 */
const IDLE_DISPOSE_MS = 10_000;

export type LiveSessionOptions = {
	sessionId: string;
	cwd: string;
	home: AgentHome;
	/** Called once this session has disposed itself, so the registry drops it. */
	onEmpty: () => void;
};

export class LiveSession {
	readonly sessionId: string;
	private readonly onEmpty: () => void;
	private readonly frames: SessionFrames;
	private readonly dialogs: Dialogs;
	private readonly bridge: UiBridge;
	private agent: AgentSession | undefined;
	private unsubscribe: (() => void) | undefined;
	/** The models the picker offers, refreshed when the engine's providers change. */
	private models: SnapshotModel[] = [];
	private streaming = false;
	private bashUnsettled = false;
	private idleTimer: ReturnType<typeof setTimeout> | undefined;

	private constructor(sessionId: string, onEmpty: () => void) {
		this.sessionId = sessionId;
		this.onEmpty = onEmpty;
		this.frames = new SessionFrames(() => this.onFrameCount());
		this.dialogs = new Dialogs(
			sessionId,
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
		const session = new LiveSession(options.sessionId, options.onEmpty);
		const agent = await createEngine({
			sessionId: options.sessionId,
			cwd: options.cwd,
			home: options.home,
			ui: session.bridge.host,
		});
		session.agent = agent;
		session.unsubscribe = agent.subscribe((event) => session.receive(event));
		session.models = await readModelsFrom(agent.modelRuntime);
		return session;
	}

	get isOpen(): boolean {
		return this.agent !== undefined;
	}

	get needsInput(): boolean {
		return this.dialogs.needsInput;
	}

	/**
	 * What this engine's MCP servers report through their tools. pi exposes no
	 * connection state, so a server appears here once it registered a tool and
	 * `sessions` is the only answer for "is anything connected yet".
	 */
	mcpLive(names: readonly string[]): McpLive {
		const agent = this.agent;
		if (agent === undefined)
			return { sessions: 0, servers: [], codemode: false, toolSearch: false };
		const namespaces: string[] = [];
		for (const tool of agent.getAllTools()) {
			const namespace = tool.namespace?.name;
			if (namespace !== undefined && namespace.startsWith("mcp__")) namespaces.push(namespace);
		}
		return mcpLiveOf({ names, namespaces, active: agent.getActiveToolNames() });
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

	/** Run one command and report it to every tab watching this session. */
	async run(command: Command): Promise<void> {
		try {
			await this.dispatch(command);
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
		}
	}

	/** Drop the engine. A later attach rebuilds it from the session file. */
	dispose(): void {
		const agent = this.agent;
		if (agent === undefined) return;
		// Clear the reference first: cancelling dialogs asks the session to
		// re-time itself, and a session with no engine must not schedule anything.
		this.agent = undefined;
		if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
		this.idleTimer = undefined;
		this.dialogs.cancelAll();
		this.unsubscribe?.();
		agent.dispose();
		this.onEmpty();
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
		const agent = this.engine;
		switch (command.type) {
			case "prompt":
				await this.prompt(command.text);
				return;
			case "steer":
				await agent.steer(command.text, undefined, { source: "interactive" });
				return;
			case "abort":
				this.dialogs.cancelAll();
				await agent.abort();
				return;
			case "bash":
				await agent.executeBash(command.command, undefined, {
					excludeFromContext: command.excludeFromContext,
				});
				if (this.streaming) this.bashUnsettled = true;
				this.resync();
				return;
			case "reload":
				await this.reload();
				return;
			case "set_model": {
				// Resolve against the list the browser was offered, so a pick can never
				// name a pair the engine will refuse.
				const offered = this.models.some(
					(candidate) =>
						candidate.provider === command.provider && candidate.id === command.modelId,
				);
				const model = agent.modelRuntime.getModel(command.provider, command.modelId);
				if (!offered || model === undefined) {
					throw new Error(`Model not found: ${command.provider}/${command.modelId}`);
				}
				await agent.setModel(model);
				this.resync();
				return;
			}
			case "set_thinking_level": {
				agent.setThinkingLevel(command.level);
				this.resync();
				return;
			}
		}
	}

	/**
	 * Re-read extensions, skills, packages, MCP config and the model catalog in
	 * place. The session object and its transcript stay. Settings changes call it
	 * so a live tab sees what the settings panel just wrote.
	 */
	async reload(): Promise<void> {
		const agent = this.engine;
		await agent.reload();
		this.models = await readModelsFrom(agent.modelRuntime);
		this.resync();
	}

	/**
	 * `prompt` resolves when the run finishes, but the browser only needs to know
	 * that pi accepted it. The preflight hook gives that answer before streaming.
	 */
	private prompt(text: string): Promise<void> {
		return new Promise((resolve, reject) => {
			let accepted = false;
			void this.engine
				.prompt(text, {
					source: "interactive",
					preflightResult: () => {
						accepted = true;
						resolve();
					},
				})
				.catch((error) => {
					if (accepted) this.fail(error instanceof Error ? error : new Error(String(error)));
					else reject(error);
				});
		});
	}

	private get engine(): AgentSession {
		if (this.agent === undefined) throw new Error("This session has no live engine");
		return this.agent;
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
		if (event.type === "agent_start") this.streaming = true;
		if (event.type === "agent_settled") {
			this.streaming = false;
			if (this.bashUnsettled) {
				this.bashUnsettled = false;
				this.resync();
			}
			this.scheduleIdle();
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
			snapshot: buildSnapshot(this.engine, this.models),
		};
	}

	/** Re-read the snapshot for everyone watching, after the engine changed. */
	private resync(): void {
		if (!this.isOpen) return;
		this.frames.emit(this.snapshotFrame());
	}

	/** Keep an unwatched session while it runs, waits for an answer or compacts. */
	private get busy(): boolean {
		return (
			this.agent !== undefined &&
			(this.agent.isStreaming || this.agent.isCompacting || this.dialogs.needsInput)
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
		if (this.agent === undefined || this.frames.count > 0 || this.busy) return;
		if (this.idleTimer !== undefined) return;
		this.idleTimer = setTimeout(() => this.dispose(), IDLE_DISPOSE_MS);
	}

	private emit(frame: ServerFrame): void {
		this.frames.emit(frame);
	}
}
