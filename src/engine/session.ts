import type {
	AgentSession,
	AgentSessionEvent,
	PromptOptions,
} from "@earendil-works/pi-coding-agent";
import type { FileSystem, Scope } from "effect";
import { Deferred, Effect, Queue } from "effect";

import type { McpAttention, McpEngineLive } from "#protocol/config/mcp";
import type { Command } from "#protocol/conversation/commands";
import type { DialogAnswer } from "#protocol/conversation/extui";
import type {
	ImageBlock,
	Notice,
	NoticeKind,
	ServerFrame,
	StreamingBlockKind,
	TreeEntry,
} from "#protocol/conversation/frames";
import type { EngineToSupervisor } from "#protocol/engine-ipc";
import { CommandRefused } from "#protocol/errors";

import { readMcpAttention } from "../domain/mcp/attention.ts";
import { MCP_RESOURCE_TOOL_NAMES } from "../domain/mcp/tools.ts";
import { withDefined } from "../domain/object.ts";
import { bindEngineSession } from "./bindings.ts";
import { dispatchCommand } from "./commands.ts";
import type { CommandHost } from "./commands.ts";
import { Dialogs } from "./dialogs.ts";
import type { EngineStartFailed } from "./errors.ts";
import { describe, RuntimeHandle } from "./runtime.ts";
import type { RuntimeInput } from "./runtime.ts";
import {
	historyWindow,
	noticesOf,
	sessionMeta,
	snapshotWindow,
	treeOf,
	type Window,
} from "./snapshot.ts";
import { appendedEntry, entryForMessage, toolCallsOf, toolTextOf } from "./translate.ts";
import { UiBridge } from "./ui.ts";
import { acquireSessionLock, startWatcher } from "./watcher.ts";
import type { SessionLock, SessionWatcher } from "./watcher.ts";

/**
 * One chat's live engine: the runtime, what the page is told, and the state only this
 * process can answer (the window, the tree, the questions, the foreign-write flag).
 *
 * Everything reaches the supervisor as a tagged message. The engine does not know about
 * tabs beyond the ids it was subscribed from; the supervisor routes frames and owns the
 * socket.
 */

export type EngineInput = {
	readonly sessionId: string;
	readonly file: string | undefined;
	readonly cwd: string;
	readonly place: string | null;
	readonly homeDir: string;
	readonly userHome: string;
};

export type Emit = (message: EngineToSupervisor) => void;
export type EngineLogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Readonly<Record<string, string | number | boolean>>;
export type EngineLog = (level: EngineLogLevel, message: string, fields?: LogFields) => void;

type To = "all" | { readonly tab: string };

/** What pi's `preflightResult` answers: how the prompt was accepted. */
type AcceptedPrompt = "handled" | "queued" | "started";

type StreamingFrame = Extract<ServerFrame, { t: "streaming" }>;

const noticeLimit = 200;

const sameTo = (left: To, right: To): boolean => {
	if (left === "all" || right === "all") return left === right;
	return left.tab === right.tab;
};

/**
 * Coalesces text deltas for a tick so a token stream is a handful of frames, not hundreds.
 * A lifecycle frame flushes first, so order is never re-arranged.
 */
class FrameOut {
	private pending: Array<{ readonly to: To; frame: StreamingFrame }> = [];
	private readonly emit: Emit;

	constructor(emit: Emit) {
		this.emit = emit;
	}

	to(to: To, frame: ServerFrame): void {
		if (frame.t !== "streaming") {
			this.flush();
			this.emit({ frame, t: "frame", to });
			return;
		}
		const last = this.pending.at(-1);
		if (
			last !== undefined &&
			sameTo(last.to, to) &&
			last.frame.streamId === frame.streamId &&
			last.frame.blockIndex === frame.blockIndex &&
			last.frame.kind === frame.kind
		) {
			last.frame = { ...last.frame, delta: last.frame.delta + frame.delta };
			return;
		}
		this.pending.push({ frame, to });
	}

	flush(): void {
		const pending = this.pending;
		this.pending = [];
		for (const item of pending) this.emit({ frame: item.frame, t: "frame", to: item.to });
	}
}

type SessionInput =
	| { readonly kind: "event"; readonly event: AgentSessionEvent }
	| { readonly kind: "swap"; readonly session: AgentSession }
	| { readonly kind: "flush" };

export class EngineSession {
	private runtime: RuntimeHandle;
	private readonly input: EngineInput;
	private readonly emit: Emit;
	private readonly log: EngineLog;
	private readonly frames: FrameOut;
	private events!: Queue.Queue<SessionInput>;
	private readonly tabs = new Set<string>();
	private readonly dialogs: Dialogs;
	private readonly ui: UiBridge;
	private readonly notices: Notice[] = [];
	private readonly unsupported = new Set<string>();
	private readonly toolEntries = new Map<string, string>();
	/** The servers pi last reported a problem with, replaced by each attention notice. */
	private mcpAttention = new Map<string, McpAttention>();
	private streamId: string | undefined;
	private driftReason: string | undefined;
	private watcher: SessionWatcher | undefined;
	private lock: SessionLock | undefined;
	private unsubscribe: (() => void) | undefined;
	private toolRunning = 0;
	private shutdownRequested = false;
	private readonly onShutdown: () => void;

	private constructor(
		input: EngineInput,
		runtime: RuntimeHandle,
		emit: Emit,
		log: EngineLog,
		onShutdown: () => void,
	) {
		this.input = input;
		this.runtime = runtime;
		this.emit = emit;
		this.log = log;
		this.onShutdown = onShutdown;
		this.frames = new FrameOut(emit);
		this.dialogs = new Dialogs(
			(frame) => this.frames.to("all", frame),
			() => this.sendStatus(),
		);
		this.ui = new UiBridge(
			this.dialogs,
			(method) => this.unsupportedMethod(method),
			(message, kind) => this.notice(message, kind),
		);
	}

	static open(
		input: EngineInput,
		emit: Emit,
		log: EngineLog,
		onShutdown: () => void,
	): Effect.Effect<EngineSession, EngineStartFailed, FileSystem.FileSystem | Scope.Scope> {
		return Effect.gen(function* () {
			const runtime = yield* RuntimeHandle.open({
				agentDir: input.homeDir,
				cwd: input.cwd,
				file: input.file,
				sessionId: input.sessionId,
			});
			const session = new EngineSession(input, runtime, emit, log, onShutdown);
			// F8a: a runtime that opened but could not be bound is closed here, before the
			// failure leaves the engine. Otherwise its MCP children outlive the error.
			yield* session.start().pipe(Effect.onError(() => Effect.ignoreCause(session.dispose())));
			return session;
		});
	}

	get sessionId(): string {
		return this.runtime.id;
	}

	get drift(): string | undefined {
		return this.driftReason;
	}

	get isBusy(): boolean {
		const agent = this.runtime.session;
		return (
			agent.isStreaming ||
			agent.isCompacting ||
			agent.isRetrying ||
			this.toolRunning > 0 ||
			this.dialogs.needsInput
		);
	}

	private start() {
		const self = this;
		return Effect.gen(function* () {
			self.events = yield* Queue.unbounded<SessionInput>();
			self.subscribe(self.runtime.session);
			yield* self.bind(self.runtime.session);
			yield* Effect.forkScoped(
				Effect.gen(function* () {
					for (;;) {
						const item = yield* Queue.take(self.events);
						yield* self.handle(item);
					}
				}),
			);
			yield* Effect.forkScoped(
				Effect.forever(
					Effect.sleep("16 millis").pipe(Effect.andThen(Effect.sync(() => self.frames.flush()))),
				),
			);
			self.runtime.onSwap((session) => {
				Queue.offerUnsafe(self.events, { kind: "swap", session });
			});
			self.runtime.onReplaced((replacement) => {
				self.emit({
					from: replacement.from,
					t: "rekey",
					to: replacement.to,
				});
				Queue.offerUnsafe(self.events, { kind: "flush" });
			});
			for (const diagnostic of self.runtime.diagnostics) {
				self.log(
					diagnostic.type === "error" ? "error" : diagnostic.type === "warning" ? "warn" : "info",
					diagnostic.message,
				);
			}
			yield* self.ensureLock();
			yield* self.watch();
			self.sendStatus();
		});
	}

	private subscribe(session: AgentSession): void {
		this.unsubscribe?.();
		this.unsubscribe = session.subscribe((event) => {
			Queue.offerUnsafe(this.events, { event, kind: "event" });
		});
	}

	private bind(session: AgentSession) {
		return bindEngineSession(session, {
			onError: (message) => this.notice(message, "error"),
			onShutdown: () => this.requestShutdown(),
			runtime: this.runtime,
			sessionId: this.runtime.id,
			ui: this.ui,
		});
	}

	/** Attach a tab: it gets the window, the unanswered questions and the current state. */
	subscribeTab(tab: string): void {
		this.tabs.add(tab);
		this.sendSnapshot(tab);
		this.dialogs.replay((frame) => this.frames.to({ tab }, frame));
		this.sendStatus();
	}

	unsubscribeTab(tab: string): void {
		this.tabs.delete(tab);
		this.sendStatus();
	}

	command(
		tab: string,
		command: Command,
	): Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope> {
		return dispatchCommand(this.controls(), tab, command);
	}

	answer(answer: DialogAnswer): Effect.Effect<void, CommandRefused> {
		return this.dialogs.answer(answer);
	}

	setEditorText(_tab: string, text: string): void {
		this.ui.setEditorText(text);
	}

	query(kind: string, before: string | undefined): Effect.Effect<unknown, CommandRefused> {
		const self = this;
		return Effect.gen(function* () {
			const agent = self.runtime.session;
			switch (kind) {
				case "tools":
					return {
						active: agent.getActiveToolNames(),
						all: agent.getAllTools().map((tool) => ({
							description: tool.description,
							name: tool.name,
						})),
					};
				case "systemPrompt":
					return agent.systemPrompt;
				case "history": {
					if (before === undefined) return snapshotWindow(agent) satisfies Window;
					const window = historyWindow(agent, before);
					if (window === undefined) {
						return yield* new CommandRefused({
							command: "history",
							reason: `No entry ${before} is on this branch.`,
						});
					}
					return window;
				}
				case "tree":
					return treeOf(agent.sessionManager) satisfies ReadonlyArray<TreeEntry>;
				case "reload":
					yield* self.reload();
					return undefined;
				case "mcpLive": {
					const all = agent.getAllTools();
					const tools = all.flatMap((tool) => {
						const namespace = tool.namespace;
						if (namespace === undefined || !namespace.name.startsWith("mcp__")) return [];
						return [
							withDefined(
								{
									exposure: tool.exposure,
									name: tool.name,
									namespace: namespace.name,
								},
								"annotations",
								tool.annotations,
							),
						];
					});
					return {
						active: agent.getActiveToolNames(),
						attention: [...self.mcpAttention].map(([name, attention]) => ({ attention, name })),
						registered: self.runtime.registeredMcpServers,
						resourceTools: MCP_RESOURCE_TOOL_NAMES.filter((name) =>
							all.some((tool) => tool.name === name),
						),
						tools,
					} satisfies McpEngineLive;
				}
				case "extensionSkills":
				case "contextLive":
					return yield* new CommandRefused({
						command: kind,
						reason: "The context feature lands in step 6.",
					});
				case "export":
					return yield* new CommandRefused({
						command: "export",
						reason: "Export needs a target path and lands with the catalog handler.",
					});
				case "rename":
					return yield* new CommandRefused({
						command: "rename",
						reason: "Renaming a live chat is the catalog's operation, not the engine's.",
					});
				default:
					return yield* new CommandRefused({
						command: kind,
						reason: "Unknown query.",
					});
			}
		});
	}

	/** Drop the engine: release the file, stop watching, close pi (emits session_shutdown). */
	dispose() {
		const self = this;
		return Effect.gen(function* () {
			self.shutdownRequested = true;
			self.frames.flush();
			self.watcher?.stop();
			self.watcher = undefined;
			const lock = self.lock;
			self.lock = undefined;
			if (lock !== undefined) yield* lock.release;
			self.dialogs.cancelAll();
			self.unsubscribe?.();
			self.unsubscribe = undefined;
			yield* self.runtime.dispose();
		});
	}

	private controls(): CommandHost {
		return {
			abort: () => this.abort(),
			answerDialog: (answer) => this.dialogs.answer(answer),
			drift: this.driftReason,
			followUp: (text, images) => this.queued("followUp", text, images),
			loadHistory: (tab, before) => this.loadHistory(tab, before),
			loadTree: (tab) => Effect.sync(() => this.sendTree(tab)),
			prompt: (text, images) => this.prompt(text, images),
			reloadFromDisk: () => this.reloadFromDisk(),
			steer: (text, images) => this.queued("steer", text, images),
		};
	}

	/**
	 * F6: a prompt is acknowledged when pi accepts it, not when the run ends. pi defers a
	 * prompt while an `agent_settled` handler runs, and that handler may await a network
	 * call; the browser must not wait for it. `preflightResult` is pi's own "accepted"
	 * signal, and a rejection before it is the command's failure.
	 */
	private prompt(
		text: string,
		images: ReadonlyArray<ImageBlock> | undefined,
	): Effect.Effect<void, CommandRefused, Scope.Scope> {
		const self = this;
		const agent = this.runtime.session;
		const accepted = Deferred.makeUnsafe<AcceptedPrompt, CommandRefused>();
		const reject = (error: CommandRefused): void => {
			if (Deferred.isDoneUnsafe(accepted)) {
				self.log("warn", "a run failed after pi accepted it", { reason: error.reason });
				self.notice(`The run failed: ${error.reason}`, "error");
				return;
			}
			Deferred.doneUnsafe(accepted, Effect.fail(error));
		};
		const options: PromptOptions = {
			preflightResult: (disposition) => {
				Deferred.doneUnsafe(accepted, Effect.succeed(disposition));
			},
			source: "interactive",
		};
		if (images !== undefined) options.images = [...images];
		const running = Effect.tryPromise({
			try: () => agent.prompt(text, options),
			catch: (cause) => new CommandRefused({ command: "prompt", reason: describe(cause) }),
		}).pipe(
			Effect.matchEffect({
				onFailure: (error) => Effect.sync(() => reject(error)),
				onSuccess: () => Effect.void,
			}),
		);
		return Effect.gen(function* () {
			yield* Effect.forkScoped(running);
			yield* Deferred.await(accepted);
		});
	}

	private queued(
		which: "steer" | "followUp",
		text: string,
		images: ReadonlyArray<ImageBlock> | undefined,
	): Effect.Effect<void, CommandRefused> {
		const agent = this.runtime.session;
		const call =
			which === "steer"
				? Effect.tryPromise({
						try: () => agent.steer(text, images === undefined ? undefined : [...images]),
						catch: (cause) => new CommandRefused({ command: which, reason: describe(cause) }),
					})
				: Effect.tryPromise({
						try: () => agent.followUp(text, images === undefined ? undefined : [...images]),
						catch: (cause) => new CommandRefused({ command: which, reason: describe(cause) }),
					});
		return call.pipe(Effect.asVoid);
	}

	private abort(): Effect.Effect<void, CommandRefused> {
		const agent = this.runtime.session;
		return Effect.tryPromise({
			try: () => agent.abort(),
			catch: (cause) => new CommandRefused({ command: "abort", reason: describe(cause) }),
		}).pipe(Effect.asVoid);
	}

	private loadHistory(tab: string, before: string): Effect.Effect<void, CommandRefused> {
		const window = historyWindow(this.runtime.session, before);
		if (window === undefined) {
			return Effect.fail(
				new CommandRefused({
					command: "loadHistory",
					reason: `No entry ${before} is on this branch.`,
				}),
			);
		}
		this.frames.to(
			{ tab },
			{
				entries: window.entries,
				hasOlder: window.hasOlder,
				t: "prepend",
			},
		);
		return Effect.void;
	}

	private sendTree(tab: string): void {
		this.frames.to({ tab }, { entries: treeOf(this.runtime.session.sessionManager), t: "tree" });
	}

	private reload(): Effect.Effect<void, CommandRefused> {
		if (this.isBusy) {
			return Effect.fail(
				new CommandRefused({
					command: "reload",
					reason: "Stop the run before reloading this chat.",
				}),
			);
		}
		const self = this;
		return Effect.gen(function* () {
			const agent = self.runtime.session;
			yield* Effect.tryPromise({
				try: () => agent.reload(),
				catch: (cause) => new CommandRefused({ command: "reload", reason: describe(cause) }),
			});
			self.ui.clearAutocompleteProviders();
			self.mcpAttention.clear();
			self.broadcast(sessionMeta(agent));
		});
	}

	/**
	 * Read the session file again after another process changed it. Rebuilding the runtime
	 * is the only honest way back: pi holds the transcript it loaded, so merging a file
	 * that grew underneath it would invent an order.
	 */
	private reloadFromDisk(): Effect.Effect<
		void,
		CommandRefused,
		FileSystem.FileSystem | Scope.Scope
	> {
		if (this.isBusy) {
			return Effect.fail(
				new CommandRefused({
					command: "reloadFromDisk",
					reason: "Stop the run before reloading this chat.",
				}),
			);
		}
		const self = this;
		return Effect.gen(function* () {
			yield* self
				.reopen()
				.pipe(
					Effect.catchTag("EngineStartFailed", (error) =>
						Effect.fail(new CommandRefused({ command: "reloadFromDisk", reason: error.reason })),
					),
				);
			self.driftReason = undefined;
			self.broadcastAll();
		});
	}

	private reopen() {
		const self = this;
		return Effect.gen(function* () {
			self.unsubscribe?.();
			self.unsubscribe = undefined;
			self.watcher?.stop();
			self.watcher = undefined;
			const lock = self.lock;
			self.lock = undefined;
			if (lock !== undefined) yield* lock.release;
			const file = self.runtime.file ?? self.input.file;
			const sessionId = self.runtime.id;
			yield* self.runtime.dispose();
			const input: RuntimeInput = {
				agentDir: self.input.homeDir,
				cwd: self.input.cwd,
				file,
				sessionId,
			};
			self.runtime = yield* RuntimeHandle.open(input);
			self.subscribe(self.runtime.session);
			self.mcpAttention.clear();
			yield* self.bind(self.runtime.session);
			yield* self.ensureLock();
			yield* self.watch();
			self.sendStatus();
		});
	}

	private sendSnapshot(tab?: string): void {
		const agent = this.runtime.session;
		const window = snapshotWindow(agent);
		const compaction = noticesOf(agent.sessionManager);
		const notices = [...compaction, ...this.notices].slice(-noticeLimit);
		const frame: ServerFrame = {
			entries: window.entries,
			hasOlder: window.hasOlder,
			notices,
			sessionId: agent.sessionId,
			t: "snapshot",
		};
		this.frames.to(tab === undefined ? "all" : { tab }, frame);
		this.frames.to(tab === undefined ? "all" : { tab }, sessionMeta(agent));
	}

	private broadcastAll(): void {
		this.sendSnapshot();
		this.frames.to("all", {
			busy: this.runtime.session.isStreaming,
			t: "busy",
		});
	}

	private broadcast(frame: ServerFrame): void {
		this.frames.to("all", frame);
	}

	private notice(text: string, kind: NoticeKind): void {
		// pi's MCP extension reports every server that needs attention in one notice, and
		// a fresh one replaces the previous answer. Any other notice leaves it alone.
		const attention = readMcpAttention(text);
		if (attention !== undefined) this.mcpAttention = new Map(attention);
		const notice: Notice = {
			afterEntryId: null,
			id: crypto.randomUUID(),
			kind,
			text,
		};
		this.notices.push(notice);
		if (this.notices.length > noticeLimit) this.notices.shift();
		this.frames.to("all", { id: notice.id, kind, text, t: "notice" });
	}

	private unsupportedMethod(method: string): void {
		if (this.unsupported.has(method)) return;
		this.unsupported.add(method);
		this.notice(
			`An extension used ${method}, which this dashboard does not render yet.`,
			"warning",
		);
	}

	private sendStatus(): void {
		const agent = this.runtime.session;
		this.emit({
			busy: this.isBusy,
			needsInput: this.dialogs.needsInput,
			sessionId: agent.sessionId,
			t: "status",
		});
		this.frames.to("all", {
			busy: agent.isStreaming || this.toolRunning > 0,
			compacting: agent.isCompacting,
			t: "busy",
		});
		if (this.shutdownRequested && !this.isBusy) this.onShutdown();
	}

	private requestShutdown(): void {
		if (this.shutdownRequested) return;
		this.shutdownRequested = true;
		this.notice(
			"An extension asked to close this chat, so its engine is closing. Every other chat keeps running; the next message reopens this one from its file.",
			"warning",
		);
		if (!this.isBusy) this.onShutdown();
	}

	private ensureLock() {
		const self = this;
		return Effect.gen(function* () {
			if (self.lock !== undefined) return;
			const file = self.runtime.file;
			if (file === undefined) return;
			const lock = yield* acquireSessionLock(file);
			self.lock = lock;
			if (!lock.acquired) {
				self.foreign("another Epsilon process has it open");
			}
		});
	}

	private watch() {
		const self = this;
		return Effect.gen(function* () {
			self.watcher?.stop();
			self.watcher = yield* startWatcher({
				file: () => self.runtime.file ?? self.input.file,
				onForeign: (reason) => self.foreign(reason),
			});
		});
	}

	/** A write this engine did not make: read-only until the tab reloads from disk. */
	private foreign(reason: string): void {
		if (this.driftReason !== undefined) return;
		this.driftReason = reason;
		this.broadcast({ reason, t: "drift" });
		this.notice(
			`This chat changed outside Epsilon (${reason}). It is read-only here until you reload it.`,
			"warning",
		);
	}

	private handle(item: SessionInput) {
		const self = this;
		return Effect.gen(function* () {
			if (item.kind === "swap") {
				yield* self.swap(item.session);
				return;
			}
			if (item.kind === "flush") {
				self.broadcastAll();
				return;
			}
			yield* self.receive(item.event);
		});
	}

	/** pi replaced the session under this runtime; subscriptions belong to the new one. */
	private swap(session: AgentSession) {
		const self = this;
		return Effect.gen(function* () {
			self.subscribe(session);
			self.ui.clearAutocompleteProviders();
			self.streamId = undefined;
			self.toolEntries.clear();
			self.mcpAttention.clear();
			yield* self
				.bind(session)
				.pipe(
					Effect.catchTag("EngineStartFailed", (error) =>
						Effect.sync(() =>
							self.notice(`The new session could not be bound: ${error.reason}`, "error"),
						),
					),
				);
			const lock = self.lock;
			self.lock = undefined;
			if (lock !== undefined) yield* lock.release;
			self.driftReason = undefined;
			yield* self.ensureLock();
			yield* self.watch();
			self.broadcastAll();
		});
	}

	private receive(event: AgentSessionEvent) {
		const self = this;
		return Effect.gen(function* () {
			switch (event.type) {
				case "message_start":
					if (event.message.role === "assistant") self.streamId = crypto.randomUUID();
					self.sendStatus();
					return;
				case "message_update": {
					const delta = event.assistantMessageEvent;
					if (
						(delta.type === "text_delta" || delta.type === "thinking_delta") &&
						self.streamId !== undefined
					) {
						const kind: StreamingBlockKind = delta.type === "text_delta" ? "text" : "thinking";
						self.frames.to("all", {
							blockIndex: delta.contentIndex,
							delta: delta.delta,
							kind,
							streamId: self.streamId,
							t: "streaming",
						});
					}
					if (delta.type === "done" || delta.type === "error") {
						if (self.streamId !== undefined) {
							self.frames.to("all", { streamId: self.streamId, t: "streamingEnd" });
							self.streamId = undefined;
						}
					}
					return;
				}
				case "message_end": {
					const manager = self.runtime.session.sessionManager;
					const found = entryForMessage(manager, event.message);
					const leaf = manager.getLeafEntry();
					const fallback =
						leaf?.type === "message" &&
						leaf.message.role === event.message.role &&
						leaf.message.timestamp === event.message.timestamp
							? leaf
							: undefined;
					const entry = appendedEntry(found ?? fallback);
					if (entry === undefined) return;
					if (entry.role === "assistant") {
						for (const call of toolCallsOf(entry)) {
							self.toolEntries.set(call.id, entry.id);
						}
					}
					const frame: ServerFrame =
						entry.role === "assistant" && self.streamId !== undefined
							? { entry, streamId: self.streamId, t: "append" }
							: { entry, t: "append" };
					self.frames.to("all", frame);
					if (entry.role === "assistant") self.streamId = undefined;
					self.watcher?.markOwn();
					yield* self.ensureLock();
					self.sendStatus();
					return;
				}
				case "entry_appended":
					if (event.entry.type === "session_info") {
						self.broadcast(sessionMeta(self.runtime.session));
					}
					self.watcher?.markOwn();
					return;
				case "agent_start":
					self.sendStatus();
					return;
				case "agent_end":
					self.watcher?.markOwn();
					return;
				case "agent_settled":
					self.watcher?.markOwn();
					self.broadcastAll();
					if (self.runtime.file !== undefined) {
						yield* self.ensureLock();
					}
					self.sendStatus();
					return;
				case "tool_execution_start":
					self.toolRunning++;
					self.broadcast({
						entryId: self.toolEntries.get(event.toolCallId) ?? "",
						output: undefined,
						status: "running",
						t: "toolDelta",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
					});
					self.sendStatus();
					return;
				case "tool_execution_update":
					self.broadcast({
						entryId: self.toolEntries.get(event.toolCallId) ?? "",
						output: toolTextOf(event.partialResult),
						status: "running",
						t: "toolDelta",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
					});
					return;
				case "tool_execution_end":
					self.toolRunning = Math.max(0, self.toolRunning - 1);
					self.broadcast({
						durationMs: event.durationMs,
						entryId: self.toolEntries.get(event.toolCallId) ?? "",
						output: toolTextOf(event.result),
						status: event.isError ? "error" : "ok",
						t: "toolDelta",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
					});
					self.sendStatus();
					return;
				case "compaction_start":
					self.broadcast({ busy: true, compacting: true, t: "busy" });
					return;
				case "compaction_end":
					self.broadcast({ busy: self.runtime.session.isStreaming, compacting: false, t: "busy" });
					return;
				case "auto_retry_start":
					self.notice(`Retrying the request: ${event.errorMessage}`, "retry");
					return;
				case "session_info_changed":
					self.broadcast(sessionMeta(self.runtime.session));
					return;
				case "queue_update":
					self.sendStatus();
					return;
				default:
					return;
			}
		});
	}
}
