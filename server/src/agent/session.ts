/**
 * One live engine session and the state the browser cannot rebuild by itself.
 * The transcript is pi's session file; the dialogs and display state live in
 * `dialogs.ts`. Nothing here speaks a protocol to a child: a command is a method
 * call on the embedded `AgentSession` (ADR-0008).
 */
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { Command, DialogAnswer, ServerFrame, SnapshotModel } from "shared";

import { Dialogs } from "./dialogs";
import type { FrameSink } from "./dialogs";
import { createEngine, toJsonEvent } from "./engine";
import type { UiHost } from "./engine";
import { readModelsFrom } from "./models";
import { buildSnapshot } from "./snapshot";

/**
 * How long a session with no tab stays alive. A reload, a route change or a
 * phone locking the screen reattaches inside it; a run or a pending dialog keeps
 * the session alive for as long as it needs.
 */
const IDLE_DISPOSE_MS = 10_000;

export type LiveSessionOptions = {
	sessionId: string;
	cwd: string;
	agentHome: string;
	/** Called once this session has disposed itself, so the registry drops it. */
	onEmpty: () => void;
};

export class LiveSession {
	readonly sessionId: string;
	private readonly onEmpty: () => void;
	private readonly subscribers = new Set<FrameSink>();
	private readonly dialogs: Dialogs;
	/** TUI-only methods seen before the first tab attached, flushed as one notice. */
	private readonly earlyUnsupported = new Set<string>();
	private agent: AgentSession | undefined;
	private unsubscribe: (() => void) | undefined;
	/** The models the picker offers, refreshed when the engine's providers change. */
	private models: SnapshotModel[] = [];
	private streaming = false;
	private bashUnsettled = false;
	private disposed = false;
	private idleTimer: ReturnType<typeof setTimeout> | undefined;

	private constructor(sessionId: string, onEmpty: () => void) {
		this.sessionId = sessionId;
		this.onEmpty = onEmpty;
		this.dialogs = new Dialogs(
			sessionId,
			(frame) => this.emit(frame),
			() => this.sendMeta(),
		);
	}

	static async open(options: LiveSessionOptions): Promise<LiveSession> {
		const session = new LiveSession(options.sessionId, options.onEmpty);
		const agent = await createEngine({
			sessionId: options.sessionId,
			cwd: options.cwd,
			agentHome: options.agentHome,
			ui: session.ui,
		});
		session.agent = agent;
		session.unsubscribe = agent.subscribe((event) => session.receive(event));
		session.models = await readModelsFrom(agent.modelRuntime);
		return session;
	}

	get isOpen(): boolean {
		return this.agent !== undefined && !this.disposed;
	}

	get needsInput(): boolean {
		return this.dialogs.needsInput;
	}

	/**
	 * A late subscriber gets the meta, every unanswered dialog, the keyed display
	 * state and the snapshot, so a blocking dialog is never invisible.
	 */
	subscribe(sink: FrameSink): () => void {
		if (this.idleTimer !== undefined) {
			clearTimeout(this.idleTimer);
			this.idleTimer = undefined;
		}
		this.subscribers.add(sink);
		if (this.earlyUnsupported.size > 0) {
			this.dialogs.reportUnsupported(this.earlyUnsupported);
			this.earlyUnsupported.clear();
		}
		this.dialogs.replay(sink);
		this.sendMetaTo(sink);
		sink(this.snapshotFrame());
		return () => {
			this.subscribers.delete(sink);
			if (this.subscribers.size === 0) this.scheduleIdle();
		};
	}

	/** Answer one dialog. The first answer wins; a repeat is ignored. */
	answerDialog(answer: DialogAnswer): boolean {
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
		if (this.disposed) return;
		this.disposed = true;
		if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
		this.idleTimer = undefined;
		this.dialogs.cancelAll();
		this.unsubscribe?.();
		this.agent?.dispose();
		this.agent = undefined;
		this.onEmpty();
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

	/** The bridge the engine's `ExtensionUIContext` calls. */
	private get ui(): UiHost {
		return {
			ask: this.dialogs.ask,
			display: this.dialogs.display,
			unsupported: (method) => this.reportUnsupported(method),
			fail: (error) => this.fail(error),
		};
	}

	private reportUnsupported(method: string): void {
		if (this.subscribers.size === 0) {
			this.earlyUnsupported.add(method);
			return;
		}
		this.dialogs.unsupported(method);
	}

	private fail(error: Error): void {
		this.emit({
			t: "error",
			code: "AGENT_FAILED",
			message: error.message,
			sessionId: this.sessionId,
		});
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
		for (const sink of this.subscribers) sink(this.snapshotFrame());
	}

	/** Keep an unwatched session while it runs, waits for an answer or compacts. */
	private get busy(): boolean {
		return (
			this.agent !== undefined &&
			(this.agent.isStreaming || this.agent.isCompacting || this.dialogs.needsInput)
		);
	}

	private scheduleIdle(): void {
		if (this.disposed || this.subscribers.size > 0 || this.busy) return;
		if (this.idleTimer !== undefined) return;
		this.idleTimer = setTimeout(() => this.dispose(), IDLE_DISPOSE_MS);
	}

	private sendMeta(): void {
		for (const sink of this.subscribers) this.sendMetaTo(sink);
		this.scheduleIdle();
	}

	private sendMetaTo(sink: FrameSink): void {
		sink({ t: "meta", sessionId: this.sessionId, needsInput: this.dialogs.needsInput });
	}

	private emit(frame: ServerFrame): void {
		for (const sink of this.subscribers) sink(frame);
	}
}
