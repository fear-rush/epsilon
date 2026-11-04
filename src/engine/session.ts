import type {
	AgentSession,
	AgentSessionEvent,
	PromptOptions,
} from "@earendil-works/pi-coding-agent";
import type { Scope } from "effect";
import { Deferred, Effect, FileSystem, Option, Queue, Schema } from "effect";

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
import type { ThinkingLevel } from "#protocol/conversation/session";
import type { EngineToSupervisor } from "#protocol/engine-ipc";
import { CommandRefused } from "#protocol/errors";
import type { ContextEngineLive } from "#protocol/settings/context";
import type { McpAttention, McpEngineLive } from "#protocol/settings/mcp";
import type { ExtensionSkillsAnswer } from "#protocol/settings/skills";

import { readMcpAttention } from "../domain/mcp/attention.ts";
import { MCP_RESOURCE_TOOL_NAMES } from "../domain/mcp/tools.ts";
import { withDefined } from "../domain/object.ts";
import { EXTENSION_SKILL_SOURCE } from "../domain/skills/rules.ts";
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
import { setCodingTools } from "./tools.ts";
import { appendedEntry, entryForMessage, toolCallsOf, toolTextOf } from "./translate.ts";
import { UiBridge } from "./ui.ts";

/** A session line's id and type: the header has an id too, and it is not an entry. */
const EntryLine = Schema.Struct({ id: Schema.String, type: Schema.String });
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
	/** The shell command in flight, so its chunks land in its own row and not the next. */
	private bashRun: { readonly command: string; readonly id: string; output: string } | undefined;
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
				case "models":
					return agent.modelRuntime.getModels().map((model) => ({
						id: model.id,
						name: model.name,
						provider: model.provider,
					}));
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
				case "extensionSkills": {
					const skills = agent.resourceLoader
						.getSkills()
						.skills.filter((skill) => skill.sourceInfo.source.startsWith(EXTENSION_SKILL_SOURCE))
						.map((skill) => ({
							baseDir: skill.baseDir,
							description: skill.description,
							disableModelInvocation: skill.disableModelInvocation,
							filePath: skill.filePath,
							name: skill.name,
						}));
					return { skills } satisfies ExtensionSkillsAnswer;
				}
				case "contextLive": {
					const usage = agent.getContextUsage();
					return {
						sessionId: agent.sessionId,
						systemPrompt: agent.systemPrompt,
						tools: {
							active: agent.getActiveToolNames(),
							all: agent.getAllTools().map((tool) =>
								tool.namespace === undefined
									? { description: tool.description, name: tool.name }
									: {
											description: tool.description,
											name: tool.name,
											namespace: tool.namespace.name,
										},
							),
						},
						...withDefined({}, "contextUsage", usage),
					} satisfies ContextEngineLive;
				}
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
			abortBash: () => this.abortBash(),
			abortCompaction: () => this.abortCompaction(),
			bash: (text, excludeFromContext) => this.bash(text, excludeFromContext),
			cancelRetry: () => this.cancelRetry(),
			clearQueue: () => this.clearQueue(),
			compact: () => this.compact(),
			followUp: (text, images) => this.queued("followUp", text, images),
			fork: (entryId, position) => this.fork(entryId, position),
			loadHistory: (tab, before) => this.loadHistory(tab, before),
			loadTree: (tab) => Effect.sync(() => this.sendTree(tab)),
			navigateTree: (targetId) => this.navigateTree(targetId),
			prompt: (text, images) => this.prompt(text, images),
			setAutoCompaction: (enabled) => this.setAutoCompaction(enabled),
			setAutoRetry: (enabled) => this.setAutoRetry(enabled),
			setCodingTools: (enabled) => this.setCodingTools(enabled),
			setHideThinking: (hidden) => this.setHideThinking(hidden),
			setLabel: (label) => this.setLabel(label),
			setModel: (provider, modelId) => this.setModel(provider, modelId),
			setThinking: (level) => this.setThinking(level),
			setTools: (names) => this.setTools(names),
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
		const self = this;
		const agent = this.runtime.session;
		return Effect.sync(() => self.takeQueue()).pipe(
			Effect.andThen(
				Effect.tryPromise({
					try: () => agent.abort(),
					catch: (cause) => new CommandRefused({ command: "abort", reason: describe(cause) }),
				}),
			),
			Effect.andThen(Effect.sync(() => self.sendQueue())),
			Effect.asVoid,
		);
	}

	/**
	 * Empty pi's queue and put its text back in the composer, which is what pi's own editor
	 * does when a run is stopped.
	 */
	private clearQueue(): Effect.Effect<void, CommandRefused> {
		const self = this;
		return Effect.sync(() => {
			self.takeQueue();
			self.sendQueue();
		});
	}

	private takeQueue(): void {
		const queue = this.runtime.session.clearQueue();
		this.restoreQueue(queue);
	}

	/** pi's editor joins the prompts it dropped with a blank line, in front of the draft. */
	private restoreQueue(queue: {
		readonly steering: ReadonlyArray<string>;
		readonly followUp: ReadonlyArray<string>;
	}): void {
		const text = [...queue.steering, ...queue.followUp].join("\n\n");
		if (text === "") return;
		this.broadcast({
			nonce: crypto.randomUUID(),
			sessionId: this.runtime.session.sessionId,
			text,
			t: "editorText",
		});
	}

	/**
	 * A shell command, the way pi's `!cmd` runs one: its output streams to every tab, and
	 * pi records the execution in the session once it ends. `!!` keeps it out of the context
	 * the model reads next turn.
	 */
	private bash(text: string, excludeFromContext: boolean): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		if (this.bashRun !== undefined) {
			return Effect.fail(
				new CommandRefused({ command: "bash", reason: "A shell command is already running." }),
			);
		}
		const id = crypto.randomUUID();
		this.bashRun = { command: text, id, output: "" };
		this.sendBash();
		return Effect.tryPromise({
			try: () =>
				agent.executeBash(text, (chunk) => self.bashChunk(id, chunk), { excludeFromContext, id }),
			catch: (cause) => new CommandRefused({ command: "bash", reason: describe(cause) }),
		}).pipe(
			Effect.andThen(
				Effect.sync(() => {
					self.bashRun = undefined;
					self.sendBash();
				}),
			),
		);
	}

	private bashChunk(id: string, chunk: string): void {
		const run = this.bashRun;
		if (run === undefined || run.id !== id) return;
		this.bashRun = { command: run.command, id, output: run.output + chunk };
		this.sendBash();
	}

	private abortBash(): Effect.Effect<void, CommandRefused> {
		const self = this;
		return Effect.try({
			try: () => self.runtime.session.abortBash(),
			catch: (cause) => new CommandRefused({ command: "abortBash", reason: describe(cause) }),
		});
	}

	/** The composer's Tools menu, through pi's own active-tool list. */
	private setCodingTools(enabled: boolean): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => setCodingTools(agent, enabled),
			catch: (cause) => new CommandRefused({ command: "setCodingTools", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(sessionMeta(agent)))));
	}

	/** pi's setting writers, so a terminal reading the same home sees the same choice. */
	private setAutoCompaction(enabled: boolean): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.setAutoCompactionEnabled(enabled),
			catch: (cause) =>
				new CommandRefused({ command: "setAutoCompaction", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(sessionMeta(agent)))));
	}

	private setAutoRetry(enabled: boolean): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.setAutoRetryEnabled(enabled),
			catch: (cause) => new CommandRefused({ command: "setAutoRetry", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(sessionMeta(agent)))));
	}

	private setHideThinking(hidden: boolean): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.settingsManager.setHideThinkingBlock(hidden),
			catch: (cause) => new CommandRefused({ command: "setHideThinking", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(sessionMeta(agent)))));
	}

	private setLabel(label: string): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.setSessionName(label),
			catch: (cause) => new CommandRefused({ command: "setLabel", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(sessionMeta(agent)))));
	}

	private abortCompaction(): Effect.Effect<void, CommandRefused> {
		const self = this;
		return Effect.try({
			try: () => self.runtime.session.abortCompaction(),
			catch: (cause) => new CommandRefused({ command: "abortCompaction", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.sendStatus())));
	}

	private cancelRetry(): Effect.Effect<void, CommandRefused> {
		const self = this;
		return Effect.try({
			try: () => self.runtime.session.abortRetry(),
			catch: (cause) => new CommandRefused({ command: "cancelRetry", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.sendStatus())));
	}

	/**
	 * pi's own model switch. The model is looked up in the runtime's composition first, so
	 * an id the operator typed cannot reach a provider pi never composed.
	 */
	private setModel(provider: string, modelId: string): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		const model = agent.modelRuntime.getModel(provider, modelId);
		if (model === undefined) {
			return Effect.fail(
				new CommandRefused({
					command: "setModel",
					reason: `pi does not know the model ${provider}/${modelId}.`,
				}),
			);
		}
		return Effect.tryPromise({
			try: () => agent.setModel(model),
			catch: (cause) => new CommandRefused({ command: "setModel", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(sessionMeta(agent)))));
	}

	private setThinking(level: ThinkingLevel): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.setThinkingLevel(level),
			catch: (cause) => new CommandRefused({ command: "setThinking", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(sessionMeta(agent)))));
	}

	/** pi ignores an unknown or hidden tool name, so the broadcast carries the real set. */
	private setTools(names: ReadonlyArray<string>): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.setActiveToolsByName([...names]),
			catch: (cause) => new CommandRefused({ command: "setTools", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(sessionMeta(agent)))));
	}

	/**
	 * pi copies the branch into a new session file. The replacement re-keys the engine and
	 * the swap broadcasts the new window, so the page follows the new id. The text pi
	 * selected is the message the operator may send next, as with a tree move.
	 */
	private fork(entryId: string, position: "before" | "at"): Effect.Effect<void, CommandRefused> {
		const self = this;
		return this.runtime
			.replace((runtime) => runtime.fork(entryId, { position }))
			.pipe(
				Effect.flatMap((result) => {
					if (result.cancelled) {
						return Effect.fail(
							new CommandRefused({ command: "fork", reason: "An extension cancelled the fork." }),
						);
					}
					return Effect.sync(() => {
						if (result.selectedText !== undefined) {
							self.frames.to("all", {
								nonce: crypto.randomUUID(),
								sessionId: self.runtime.session.sessionId,
								text: result.selectedText,
								t: "editorText",
							});
						}
					});
				}),
				Effect.mapError((error) =>
					error instanceof CommandRefused
						? error
						: new CommandRefused({ command: "fork", reason: error.reason }),
				),
			);
	}

	/** pi's manual compaction: it aborts a running turn first and refuses a tiny session. */
	private compact(): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.tryPromise({
			try: () => agent.compact(),
			catch: (cause) => new CommandRefused({ command: "compact", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(sessionMeta(agent)))));
	}

	/**
	 * Move the leaf inside this file. pi answers the text of a user message it moved past,
	 * which is the next message the operator may send; the page puts it back in the
	 * composer. The branch is session-wide, so every tab receives the new window.
	 */
	private navigateTree(targetId: string): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.tryPromise({
			try: () => agent.navigateTree(targetId),
			catch: (cause) => new CommandRefused({ command: "navigateTree", reason: describe(cause) }),
		}).pipe(
			Effect.flatMap((result) => {
				if (result.cancelled) {
					return Effect.fail(
						new CommandRefused({
							command: "navigateTree",
							reason: "The branch change was cancelled.",
						}),
					);
				}
				return Effect.sync(() => {
					if (result.editorText !== undefined) {
						self.frames.to("all", {
							nonce: crypto.randomUUID(),
							sessionId: self.runtime.session.sessionId,
							text: result.editorText,
							t: "editorText",
						});
					}
					self.broadcastAll();
				});
			}),
		);
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
		if (tab === undefined) {
			this.sendQueue();
			this.sendBash();
		} else {
			this.frames.to({ tab }, this.queueFrame());
			this.frames.to({ tab }, this.bashFrame());
		}
	}

	/** Where a tab sends a prompt for the running turn, and what pi will send next. */
	private queueFrame(): Extract<ServerFrame, { t: "queue" }> {
		const agent = this.runtime.session;
		return {
			followUp: [...agent.getFollowUpMessages()],
			steering: [...agent.getSteeringMessages()],
			t: "queue",
		};
	}

	private sendQueue(): void {
		this.broadcast(this.queueFrame());
	}

	/** The running shell command, or the empty state every tab starts from. */
	private bashFrame(): Extract<ServerFrame, { t: "bash" }> {
		const run = this.bashRun;
		return run === undefined
			? { command: "", output: "", running: false, t: "bash" }
			: { command: run.command, output: run.output, running: true, t: "bash" };
	}

	private sendBash(): void {
		this.broadcast(this.bashFrame());
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
			retrying: agent.isRetrying,
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
				ownWrite: (from) => self.ownWrite(from),
			});
		});
	}

	/**
	 * Whether every entry written after byte `from` is one this engine wrote.
	 *
	 * The session manager holds the entries this engine added; an id it does not know was
	 * appended by someone else, even when an own write followed it in the same window.
	 * A line that does not parse yet is a write in progress: the next tick reads it whole.
	 */
	private ownWrite(from: number): Effect.Effect<boolean, never, FileSystem.FileSystem> {
		const self = this;
		return Effect.gen(function* () {
			const file = self.runtime.file ?? self.input.file;
			if (file === undefined) return true;
			const fs = yield* FileSystem.FileSystem;
			const bytes = yield* fs.readFile(file).pipe(Effect.orElseSucceed(() => new Uint8Array()));
			const appended = new TextDecoder().decode(bytes.subarray(from));
			for (const line of appended.split("\n")) {
				if (line.trim() === "") continue;
				// A JSON string decoded through the schema: a line still being written fails
				// here, and the next tick reads it whole.
				const id = yield* Effect.option(
					Schema.decodeEffect(Schema.fromJsonString(EntryLine))(line),
				);
				if (Option.isNone(id)) return true;
				// The header is this manager's own first line; it carries an id but is not an entry.
				if (id.value.type === "session") continue;
				if (self.runtime.session.sessionManager.getEntry(id.value.id) === undefined) return false;
			}
			return true;
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
					yield* self.ensureLock();
					self.sendStatus();
					return;
				}
				case "entry_appended":
					if (event.entry.type === "session_info") {
						self.broadcast(sessionMeta(self.runtime.session));
					}
					return;
				case "agent_start":
					self.sendStatus();
					return;
				case "agent_end":
					return;
				case "agent_settled":
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
					// The reason stays in the notice until the run status row can carry it.
					self.notice(`Retrying the request: ${event.errorMessage}`, "retry");
					self.sendStatus();
					return;
				case "auto_retry_end":
					self.sendStatus();
					return;
				case "session_info_changed":
					self.broadcast(sessionMeta(self.runtime.session));
					return;
				case "queue_update":
					self.sendQueue();
					return;
				default:
					return;
			}
		});
	}
}
