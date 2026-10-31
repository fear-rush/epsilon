/**
 * One live engine session and the state the browser cannot rebuild by itself.
 * The transcript is pi's session file; the dialogs and display state live in
 * `dialogs.ts`, and the fan-out to tabs in `SessionFrames` below. A command is a method
 * call on the embedded `AgentSession` (docs/DECISIONS.md, Embedded engine); no process speaks to this one.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
	AgentSession,
	AgentSessionEvent,
	PromptOptions,
} from "@earendil-works/pi-coding-agent";
import type {
	Command,
	DialogAnswer,
	Place,
	PromptBehavior,
	PromptImage,
	ProtocolErrorCode,
	ServerFrame,
	SnapshotModel,
} from "shared";

import type { AgentHome } from "../../platform/agent-home";
import type { McpLive } from "../mcp";
import { mcpLiveOf } from "../mcp";
import { Dialogs } from "./dialogs";
import type { AnswerOutcome, FrameSink } from "./dialogs";
import { createEngine, setCodingTools, toJsonEvent } from "./engine";
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

/** The two files pi writes a transcript as, and the type a browser saves each under. */
export type ExportFormat = "html" | "jsonl";

const EXPORT_FILE: Record<ExportFormat, { extension: string; mimeType: string }> = {
	html: { extension: "html", mimeType: "text/html;charset=utf-8" },
	jsonl: { extension: "jsonl", mimeType: "application/x-ndjson" },
};

/** What a browser saves: the bytes pi wrote, and the name to save them under. */
export type ExportedSession = { filename: string; mimeType: string; text: string };

/**
 * The stem of a download's name. The chat's own name when it has one, else its id,
 * with everything a file system or a browser would read as a path removed.
 */
const exportStem = (name: string | undefined, sessionId: string): string => {
	const cleaned = (name ?? "").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^[-.]+|[-.]+$/g, "");
	// Count code points, so a truncation cannot cut a character in half.
	const stem = [...cleaned].slice(0, 80).join("");
	return stem === "" ? `session-${sessionId}` : stem;
};

export type LiveSessionOptions = {
	sessionId: string;
	cwd: string;
	/** The session file, or undefined for a session pi has not written yet. */
	file: string | undefined;
	place: Place;
	home: AgentHome;
	/** Called once this session has disposed itself, so the registry drops it. */
	onEmpty: () => void;
};

export class LiveSession {
	readonly sessionId: string;
	readonly place: Place;
	private readonly onEmpty: () => void;
	private readonly frames: SessionFrames;
	private readonly dialogs: Dialogs;
	private readonly bridge: UiBridge;
	private agent: AgentSession | undefined;
	private unsubscribe: (() => void) | undefined;
	/** The models the picker offers, refreshed when the engine's providers change. */
	private models: SnapshotModel[] = [];
	private idleTimer: ReturnType<typeof setTimeout> | undefined;

	private constructor(sessionId: string, place: Place, onEmpty: () => void) {
		this.sessionId = sessionId;
		this.place = place;
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
		const session = new LiveSession(options.sessionId, options.place, options.onEmpty);
		const agent = await createEngine({
			sessionId: options.sessionId,
			cwd: options.cwd,
			file: options.file,
			chat: options.place.kind === "chat",
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
	 * Drop the engine now if nothing would be lost: no run, no compaction, no
	 * question waiting. Answers whether it is gone, so a move or a delete can
	 * refuse a session that is still working.
	 */
	closeIfIdle(): boolean {
		if (this.busy) return false;
		this.dispose();
		return true;
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
		const agent = this.agent;
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
		const agent = this.engine;
		const { extension, mimeType } = EXPORT_FILE[format];
		const folder = await mkdtemp(join(tmpdir(), "epsilon-export-"));
		const path = join(folder, `session.${extension}`);
		try {
			if (format === "html") await agent.exportToHtml(path);
			else agent.exportToJsonl(path);
			const text = await readFile(path, "utf8");
			return {
				filename: `${exportStem(agent.sessionName, this.sessionId)}.${extension}`,
				mimeType,
				text,
			};
		} finally {
			await rm(folder, { recursive: true, force: true });
		}
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
				await this.prompt(command.text, command.behavior, command.images);
				return;
			case "abort":
				this.dialogs.cancelAll();
				await agent.abort();
				return;
			case "bash": {
				// `executeBash` resolves when the command finishes, so report the running
				// state first: that is what lets a tab offer `abort_bash` while it runs.
				const running = agent.executeBash(command.command, undefined, {
					excludeFromContext: command.excludeFromContext,
				});
				this.resync();
				await running;
				this.resync();
				return;
			}
			case "abort_bash":
				agent.abortBash();
				this.resync();
				return;
			case "reload":
				await this.reload();
				return;
			case "compact":
				// pi aborts the running turn before it compacts, so a busy session takes
				// this. A refusal (`Nothing to compact`) is pi's message to the tab.
				await agent.compact(command.instructions);
				this.resync();
				return;
			case "abort_compaction":
				agent.abortCompaction();
				this.resync();
				return;
			case "set_auto_compaction":
				agent.setAutoCompactionEnabled(command.enabled);
				this.resync();
				return;
			case "cancel_retry":
				agent.abortRetry();
				this.resync();
				return;
			case "set_auto_retry":
				agent.setAutoRetryEnabled(command.enabled);
				this.resync();
				return;
			case "clear_queue":
				agent.clearQueue();
				this.resync();
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
			case "set_coding_tools": {
				setCodingTools(agent, command.enabled);
				this.resync();
				return;
			}
			case "navigate_tree": {
				// pi refuses while a run or a compaction is going, and that refusal is the
				// tab's answer. A user message moves the leaf to its parent and hands its
				// text back for the editor; the tab already holds it, so the snapshot says
				// the rest: the transcript ends before the message and the branch is new.
				const result = await agent.navigateTree(command.entryId);
				if (result.cancelled) throw new Error("Navigation was cancelled");
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
	 * `behavior` is what lets a message join a run that is already going: pi refuses
	 * a prompt with no queue behavior while streaming, and `steer` cannot carry an
	 * extension command at all. An image travels as pi's `ImageContent`, which is
	 * the shape the frame already carries; pi normalises it itself, so a prompt with
	 * no images passes no image option at all.
	 */
	private prompt(
		text: string,
		behavior: PromptBehavior | undefined,
		images: PromptImage[] | undefined,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			let accepted = false;
			const options: PromptOptions = {
				source: "interactive",
				streamingBehavior: behavior,
				preflightResult: () => {
					accepted = true;
					resolve();
				},
			};
			if (images !== undefined) {
				options.images = images.map((image) => ({
					type: "image",
					data: image.data,
					mimeType: image.mimeType,
				}));
			}
			void this.engine.prompt(text, options).catch((error) => {
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
		if (event.type === "agent_settled") {
			// Token totals, context usage and the queue all move with a run, so a
			// settled engine re-reads the snapshot once instead of leaving the tab on
			// numbers from its attach.
			this.resync();
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
		return (
			this.agent !== undefined &&
			(this.agent.isStreaming ||
				this.agent.isCompacting ||
				this.agent.isRetrying ||
				this.dialogs.needsInput)
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
