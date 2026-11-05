import type {
	AgentSession,
	AgentSessionEvent,
	PromptOptions,
} from "@earendil-works/pi-coding-agent";
import type { Scope } from "effect";
import {
	Cause,
	Clock,
	Deferred,
	Effect,
	Exit,
	Fiber,
	FileSystem,
	Option,
	Queue,
	Schema,
} from "effect";

import type { Command } from "#protocol/conversation/commands";
import type { DialogAnswer, UiWidget } from "#protocol/conversation/extui";
import type {
	ImageBlock,
	Notice,
	NoticeKind,
	ServerFrame,
	StreamingBlockKind,
	TreeFilterMode,
	TreeRow,
} from "#protocol/conversation/frames";
import type { ThinkingLevel } from "#protocol/conversation/session";
import type { EngineToSupervisor, SupervisorToEngine } from "#protocol/engine-ipc";
import { CommandRefused } from "#protocol/errors";
import type { ContextEngineLive } from "#protocol/settings/context";
import type { McpAttention, McpEngineLive } from "#protocol/settings/mcp";
import type { ExtensionSkillsAnswer } from "#protocol/settings/skills";

import { parseBuiltinCommand } from "../domain/conversation/commands.ts";
import { readMcpAttention } from "../domain/mcp/attention.ts";
import { MCP_RESOURCE_TOOL_NAMES } from "../domain/mcp/tools.ts";
import { withDefined } from "../domain/object.ts";
import { EXTENSION_SKILL_SOURCE } from "../domain/skills/rules.ts";
import { suggestionsFor } from "./autocomplete.ts";
import { bindEngineSession } from "./bindings.ts";
import { dispatchCommand } from "./commands.ts";
import type { CommandHost } from "./commands.ts";
import { Dialogs } from "./dialogs.ts";
import type { EngineStartFailed } from "./errors.ts";
import { exportOf } from "./export.ts";
import { describe, RuntimeHandle } from "./runtime.ts";
import type { RuntimeInput } from "./runtime.ts";
import { runBuiltin } from "./slash.ts";
import type { BuiltinHost } from "./slash.ts";
import {
	historyWindow,
	readingsOf,
	sessionMeta,
	shadowedCommandsOf,
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
	readonly sandboxRoot: string | undefined;
};

export type Emit = (message: EngineToSupervisor) => void;
export type EngineLogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Readonly<Record<string, string | number | boolean>>;
export type EngineLog = (level: EngineLogLevel, message: string, fields?: LogFields) => void;

type To = "all" | { readonly tab: string };

/** What pi's `preflightResult` answers: how the prompt was accepted. */
type AcceptedPrompt = "handled" | "queued" | "started";

type StreamingFrame = Extract<ServerFrame, { t: "streaming" }>;

/** One question about this chat, in the shape the supervisor sends on the wire. */
type EngineQuery = Omit<Extract<SupervisorToEngine, { t: "query" }>, "id" | "t">;

const noticeLimit = 200;

/**
 * How long after the moment pi named the warmer's reading is refreshed. pi fires on its
 * own timer and sends no event when it does.
 */
const CACHE_WARM_LAG_MS = 1_000;

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
	| { readonly kind: "flush" }
	/** Re-read pi's answer and, when a cache warm is scheduled, arm its wake-up. */
	| { readonly kind: "arm" };

export class EngineSession {
	private runtime: RuntimeHandle;
	private readonly input: EngineInput;
	private readonly emit: Emit;
	private readonly log: EngineLog;
	private readonly frames: FrameOut;
	private events!: Queue.Queue<SessionInput>;
	private readonly tabs = new Set<string>();
	/**
	 * Settles when pi's extensions have finished `session_start`; commands wait on it.
	 * Binding cannot gate `ready`: pi awaits a `session_start` handler that asks a
	 * question, so the page must be able to attach and answer it first.
	 */
	private readonly bound: Deferred.Deferred<void, CommandRefused>;
	private binding = true;
	private readonly dialogs: Dialogs;
	private readonly ui: UiBridge;
	private readonly notices: Notice[] = [];
	private readonly unsupported = new Set<string>();
	/** Names already reported, so a rebind does not repeat the same shadowing notice. */
	private readonly reportedShadowed = new Set<string>();
	private readonly toolEntries = new Map<string, string>();
	/** The keyed statuses extensions set and have not cleared, in the order they first did. */
	private readonly statuses = new Map<string, string>();
	/** The keyed widgets extensions set and have not cleared, in the order they first did. */
	private readonly widgets = new Map<string, UiWidget>();
	/** The label an extension set in place of hidden thinking; pi's settings do not hold it. */
	private hiddenThinkingLabel: string | undefined;
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
	/** The moment pi named for its next cache warm, and the fiber waiting for it. */
	private warmAt: number | undefined;
	private warmFiber: Fiber.Fiber<void> | undefined;
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
		this.bound = Deferred.makeUnsafe<void, CommandRefused>();
		this.dialogs = new Dialogs(
			(frame) => this.frames.to("all", frame),
			() => this.sendStatus(),
		);
		this.ui = new UiBridge(
			this.dialogs,
			(method) => this.unsupportedMethod(method),
			(message, kind) => this.notice(message, kind),
			(key, text) => this.setStatus(key, text),
			(key, lines, placement) => this.setWidget(key, lines, placement),
			(label) => this.setHiddenThinkingLabel(label),
			(text, mode) => this.putEditorText(text, mode),
			(message) => this.setWorkingMessage(message),
			() => this.setWorkingVisible(),
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
			this.binding ||
			this.toolRunning > 0 ||
			this.dialogs.needsInput
		);
	}

	private start() {
		const self = this;
		return Effect.gen(function* () {
			self.events = yield* Queue.unbounded<SessionInput>();
			self.subscribe(self.runtime.session);
			// Forked, not awaited: see `bound`. The event loop below must already be running
			// when a handler fires `session_start`, and a question it asks needs an attached
			// page, which needs `ready`, which would otherwise wait for this.
			yield* Effect.forkScoped(
				Effect.gen(function* () {
					const outcome = yield* Effect.exit(self.bind(self.runtime.session));
					self.settleBinding(outcome);
					self.reportShadowedCommands();
				}),
			);
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

	/** Release the gate on commands, or refuse them with the reason binding failed. */
	private settleBinding(outcome: Exit.Exit<void, EngineStartFailed>): void {
		this.binding = false;
		if (Exit.isSuccess(outcome)) {
			Deferred.doneUnsafe(this.bound, Effect.void);
		} else {
			const failed = Cause.findErrorOption(outcome.cause);
			const reason = Option.isSome(failed)
				? failed.value.reason
				: describe(Cause.squash(outcome.cause));
			Deferred.doneUnsafe(
				this.bound,
				Effect.fail(new CommandRefused({ command: "engine", reason })),
			);
			this.notice(`This chat's extensions did not start: ${reason}`, "error");
		}
		// The gate was part of `busy`, so the page has to hear that it opened.
		this.sendStatus();
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
		const self = this;
		return Effect.flatMap(Deferred.await(self.bound), () =>
			dispatchCommand(self.controls(), tab, command),
		);
	}

	answer(answer: DialogAnswer): Effect.Effect<void, CommandRefused> {
		return this.dialogs.answer(answer);
	}

	setEditorText(_tab: string, text: string): void {
		this.ui.setEditorText(text);
	}

	/** One question about this chat; only the fields its kind reads are set. */
	query(question: EngineQuery): Effect.Effect<unknown, CommandRefused, FileSystem.FileSystem> {
		const self = this;
		return Effect.gen(function* () {
			// An extension's tools and commands are part of these answers, so they come
			// from a bound session.
			yield* Deferred.await(self.bound);
			const agent = self.runtime.session;
			switch (question.kind) {
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
					if (question.before === undefined) return snapshotWindow(agent) satisfies Window;
					const window = historyWindow(agent, question.before);
					if (window === undefined) {
						return yield* new CommandRefused({
							command: "history",
							reason: `No entry ${question.before} is on this branch.`,
						});
					}
					return window;
				}
				case "autocomplete": {
					if (question.text === undefined || question.cursor === undefined) {
						return yield* new CommandRefused({
							command: "autocomplete",
							reason: "An autocomplete query needs a draft and the caret's offset.",
						});
					}
					return yield* suggestionsFor(self.ui.autocompleteProviders, {
						cursor: question.cursor,
						text: question.text,
					});
				}
				case "tree":
					return treeOf(agent.sessionManager) satisfies ReadonlyArray<TreeRow>;
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
				case "export": {
					if (question.format === undefined) {
						return yield* new CommandRefused({
							command: "export",
							reason: "An export needs a format: html or jsonl.",
						});
					}
					return yield* exportOf(agent, self.runtime.id, question.format);
				}
				case "rename":
					return yield* new CommandRefused({
						command: "rename",
						reason: "Renaming a live chat is the catalog's operation, not the engine's.",
					});
				default:
					return yield* new CommandRefused({
						command: question.kind,
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
			clone: () => this.clone(),
			compact: (instructions) => this.compact(instructions),
			followUp: (text, images) => this.queued("followUp", text, images),
			fork: (entryId, position) => this.fork(entryId, position),
			loadHistory: (tab, before) => this.loadHistory(tab, before),
			loadTree: (tab) => Effect.sync(() => this.sendTree(tab)),
			navigateTree: (targetId, options) => this.navigateTree(targetId, options),
			prompt: (text, images) => this.promptOrBuiltin(text, images),
			setAutoCompaction: (enabled) => this.setAutoCompaction(enabled),
			setAutoRetry: (enabled) => this.setAutoRetry(enabled),
			setCodingTools: (enabled) => this.setCodingTools(enabled),
			setHideThinking: (hidden) => this.setHideThinking(hidden),
			setLabel: (label) => this.setLabel(label),
			setModel: (provider, modelId) => this.setModel(provider, modelId),
			setTreeLabel: (tab, entryId, label) => this.setTreeLabel(tab, entryId, label),
			setTreeFilterMode: (mode) => this.setTreeFilterMode(mode),
			setThinking: (level) => this.setThinking(level),
			setTools: (names) => this.setTools(names),
			reloadFromDisk: () => this.reloadFromDisk(),
			steer: (text, images) => this.queued("steer", text, images),
		};
	}

	/**
	 * A line the composer sent: a built-in command is answered here, before pi, so a name
	 * in the table never reaches the model; anything else is a prompt.
	 */
	private promptOrBuiltin(
		text: string,
		images: ReadonlyArray<ImageBlock> | undefined,
	): Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope> {
		const parsed = parseBuiltinCommand(text);
		return parsed === undefined
			? this.prompt(text, images)
			: runBuiltin(this.builtinHost(), parsed);
	}

	/** What the built-in router may touch on this session. */
	private builtinHost(): BuiltinHost {
		return {
			compact: (instructions) => this.compact(instructions),
			cwd: this.input.cwd,
			homeDir: this.input.homeDir,
			importSession: (file) => this.importSession(file),
			newSession: () => this.newSession(),
			notice: (text) => this.notice(text, "notice"),
			reload: () => this.reload(),
			rename: (name) => this.rename(name),
			sandboxRoot: this.input.sandboxRoot,
			userHome: this.input.userHome,
		};
	}

	/** `/name`: pi's own display name, or the name it has when the argument is empty. */
	private rename(name: string | undefined): Effect.Effect<void, CommandRefused> {
		if (name !== undefined) return this.setLabel(name);
		const current = this.runtime.session.sessionName;
		this.notice(
			current === undefined
				? "This chat has no name. Use /name <name>."
				: `This chat is called "${current}". Use /name <name> to change it.`,
			"notice",
		);
		return Effect.void;
	}

	/** `/new`: pi replaces the session and the tab follows the new id, as a fork does. */
	private newSession(): Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope> {
		return this.runtime
			.replace((runtime) => runtime.newSession())
			.pipe(
				Effect.mapError((error) => new CommandRefused({ command: "new", reason: error.reason })),
				Effect.flatMap((result) =>
					result.cancelled
						? Effect.fail(
								new CommandRefused({ command: "new", reason: "pi cancelled the new session." }),
							)
						: Effect.void,
				),
			);
	}

	/** `/import`: pi reads a session file and this chat continues in it. */
	private importSession(
		file: string,
	): Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope> {
		return this.runtime
			.replace((runtime) => runtime.importFromJsonl(file))
			.pipe(
				Effect.mapError((error) => new CommandRefused({ command: "import", reason: error.reason })),
				Effect.flatMap((result) =>
					result.cancelled
						? Effect.fail(
								new CommandRefused({ command: "import", reason: "pi cancelled the import." }),
							)
						: Effect.void,
				),
			);
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
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(self.metaOf(agent)))));
	}

	/** pi's setting writers, so a terminal reading the same home sees the same choice. */
	private setAutoCompaction(enabled: boolean): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.setAutoCompactionEnabled(enabled),
			catch: (cause) =>
				new CommandRefused({ command: "setAutoCompaction", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(self.metaOf(agent)))));
	}

	private setAutoRetry(enabled: boolean): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.setAutoRetryEnabled(enabled),
			catch: (cause) => new CommandRefused({ command: "setAutoRetry", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(self.metaOf(agent)))));
	}

	private setHideThinking(hidden: boolean): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.settingsManager.setHideThinkingBlock(hidden),
			catch: (cause) => new CommandRefused({ command: "setHideThinking", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(self.metaOf(agent)))));
	}

	private setLabel(label: string): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.setSessionName(label),
			catch: (cause) => new CommandRefused({ command: "setLabel", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(self.metaOf(agent)))));
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
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(self.metaOf(agent)))));
	}

	private setThinking(level: ThinkingLevel): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.setThinkingLevel(level),
			catch: (cause) => new CommandRefused({ command: "setThinking", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(self.metaOf(agent)))));
	}

	/** pi ignores an unknown or hidden tool name, so the broadcast carries the real set. */
	private setTools(names: ReadonlyArray<string>): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.try({
			try: () => agent.setActiveToolsByName([...names]),
			catch: (cause) => new CommandRefused({ command: "setTools", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(self.metaOf(agent)))));
	}

	/**
	 * pi copies the branch into a new session file. The replacement re-keys the engine and
	 * the swap broadcasts the new window, so the page follows the new id. The text pi
	 * selected is the message the operator may send next, as with a tree move.
	 */
	private fork(entryId: string, position: "before" | "at"): Effect.Effect<void, CommandRefused> {
		return this.copy(entryId, position, "fork");
	}

	/**
	 * `/clone`: the same copy, taken where the chat stands, so this chat's own file stays
	 * as it is and the new one is the conversation up to here.
	 */
	private clone(): Effect.Effect<void, CommandRefused> {
		const leaf = this.runtime.session.sessionManager.getLeafId();
		if (leaf === null) {
			return Effect.fail(
				new CommandRefused({
					command: "clone",
					reason: "This chat has no message to clone yet.",
				}),
			);
		}
		return this.copy(leaf, "at", "clone");
	}

	private copy(
		entryId: string,
		position: "before" | "at",
		command: "fork" | "clone",
	): Effect.Effect<void, CommandRefused> {
		const self = this;
		return this.runtime
			.replace((runtime) => runtime.fork(entryId, { position }))
			.pipe(
				Effect.flatMap((result) => {
					if (result.cancelled) {
						return Effect.fail(
							new CommandRefused({
								command,
								reason: `An extension cancelled the ${command}.`,
							}),
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
						: new CommandRefused({ command, reason: error.reason }),
				),
			);
	}

	/** pi's manual compaction: it aborts a running turn first and refuses a tiny session. */
	private compact(instructions?: string): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.tryPromise({
			try: () => agent.compact(instructions),
			catch: (cause) => new CommandRefused({ command: "compact", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(self.metaOf(agent)))));
	}

	/**
	 * Move the leaf inside this file. pi answers the text of a user message it moved past,
	 * which is the next message the operator may send; the page puts it back in the
	 * composer. The branch is session-wide, so every tab receives the new window.
	 */
	private navigateTree(
		targetId: string,
		options: {
			readonly summarize?: boolean | undefined;
			readonly customInstructions?: string | undefined;
			readonly replaceInstructions?: boolean | undefined;
		},
	): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		const piOptions = withDefined(
			withDefined(
				{ summarize: options.summarize ?? false },
				"customInstructions",
				options.customInstructions,
			),
			"replaceInstructions",
			options.replaceInstructions,
		);
		return Effect.tryPromise({
			try: () => agent.navigateTree(targetId, piOptions),
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

	/**
	 * pi's own label on one tree row: a `label` entry in the session file, so the file and
	 * a terminal show the same one. The tab that asked reads the tree again, because the
	 * tree travels on request rather than in every snapshot.
	 */
	private setTreeLabel(
		tab: string,
		entryId: string,
		label: string | undefined,
	): Effect.Effect<void, CommandRefused> {
		const self = this;
		const manager = this.runtime.session.sessionManager;
		const trimmed = label?.trim();
		return Effect.try({
			try: () =>
				manager.appendLabelChange(
					entryId,
					trimmed === undefined || trimmed === "" ? undefined : trimmed,
				),
			catch: (cause) => new CommandRefused({ command: "setTreeLabel", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.sendTree(tab))));
	}

	/**
	 * pi's tree filter, the `treeFilterMode` setting a terminal's picker reads too. The
	 * write is flushed before the broadcast, so a reader on the next line sees it.
	 */
	private setTreeFilterMode(mode: TreeFilterMode): Effect.Effect<void, CommandRefused> {
		const self = this;
		const agent = this.runtime.session;
		return Effect.tryPromise({
			try: async () => {
				agent.settingsManager.setTreeFilterMode(mode);
				await agent.settingsManager.flush();
			},
			catch: (cause) =>
				new CommandRefused({ command: "setTreeFilterMode", reason: describe(cause) }),
		}).pipe(Effect.andThen(Effect.sync(() => self.broadcast(self.metaOf(agent)))));
	}

	private sendTree(tab: string): void {
		this.frames.to({ tab }, { rows: treeOf(this.runtime.session.sessionManager), t: "tree" });
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
			self.broadcast(self.metaOf(agent));
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
		// A compaction and a branch summary travel as transcript rows, at their point.
		const notices = [...this.notices].slice(-noticeLimit);
		const frame: ServerFrame = {
			entries: window.entries,
			hasOlder: window.hasOlder,
			notices,
			sessionId: agent.sessionId,
			t: "snapshot",
		};
		const to: To = tab === undefined ? "all" : { tab };
		this.frames.to(to, frame);
		this.frames.to(to, this.metaOf(agent));
		this.frames.to(to, readingsOf(agent));
		this.frames.to(to, this.statusesFrame());
		this.frames.to(to, this.widgetsFrame());
		// The snapshot carries the warmer's reading, so its timer is armed here too: a chat
		// that opens while a warm is scheduled sees the bar change when pi warms it.
		Queue.offerUnsafe(this.events, { kind: "arm" });
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

	/** Every keyed status an extension holds, so a late tab sees the current rail. */
	private statusesFrame(): Extract<ServerFrame, { t: "statuses" }> {
		return {
			statuses: [...this.statuses].map(([key, text]) => ({ key, text })),
			t: "statuses",
		};
	}

	/** One extension status, or its removal; the whole short list goes to every tab. */
	private setStatus(key: string, text: string | undefined): void {
		if (text === undefined) this.statuses.delete(key);
		else this.statuses.set(key, text);
		this.frames.to("all", this.statusesFrame());
	}

	/** What the page draws from pi's state, plus the label and working row only an extension sets. */
	private metaOf(agent: AgentSession): Extract<ServerFrame, { t: "sessionMeta" }> {
		return sessionMeta(agent, this.hiddenThinkingLabel, this.ui.workingState);
	}

	/**
	 * Text an extension puts in the composer. pi's two meanings stay apart: `setEditorText`
	 * replaces the draft, `pasteToEditor` adds to it, and the page decides which.
	 */
	private putEditorText(text: string, mode: "replace" | "append"): void {
		this.frames.to("all", {
			mode,
			nonce: crypto.randomUUID(),
			sessionId: this.runtime.session.sessionId,
			text,
			t: "editorText",
		});
	}

	/** The working row's label, or pi's own word when an extension clears it. */
	private setWorkingMessage(_message: string | undefined): void {
		this.frames.to("all", this.metaOf(this.runtime.session));
	}

	/** Whether the working row is drawn while a run is going. */
	private setWorkingVisible(): void {
		this.frames.to("all", this.metaOf(this.runtime.session));
	}

	/** The label that stands in for hidden thinking, from an extension; sent back to tabs. */
	private setHiddenThinkingLabel(label: string): void {
		this.hiddenThinkingLabel = label;
		const agent = this.runtime.session;
		this.frames.to("all", this.metaOf(agent));
	}

	/** Every widget an extension holds, so a late tab sees what the composer shows. */
	private widgetsFrame(): Extract<ServerFrame, { t: "widgets" }> {
		return { t: "widgets", widgets: [...this.widgets.values()] };
	}

	/** One extension widget above or below the composer, or its removal. */
	private setWidget(
		key: string,
		lines: ReadonlyArray<string> | undefined,
		placement: "aboveEditor" | "belowEditor" | undefined,
	): void {
		if (lines === undefined) this.widgets.delete(key);
		else this.widgets.set(key, { key, lines: [...lines], placement: placement ?? "aboveEditor" });
		this.frames.to("all", this.widgetsFrame());
	}

	/** The composer's readings now, and the warmer's timer re-armed from pi's answer. */
	private publishReadings(): Effect.Effect<void, never, Scope.Scope> {
		const self = this;
		return Effect.gen(function* () {
			self.broadcast(readingsOf(self.runtime.session));
			yield* self.armWarming();
		});
	}

	/**
	 * pi's warmer fires on its own timer and sends no session event when it does, so the
	 * page would otherwise promise a warm that already happened. One wake-up after the
	 * moment pi named keeps it honest; a moment in the past never becomes a timer again.
	 */
	private armWarming(): Effect.Effect<void, never, Scope.Scope> {
		const self = this;
		return Effect.gen(function* () {
			const warming = self.runtime.session.cacheWarmingStatus;
			const at = warming?.state === "scheduled" ? warming.nextWarmAt : undefined;
			if (at === self.warmAt) return;
			self.warmAt = at;
			const previous = self.warmFiber;
			self.warmFiber = undefined;
			if (previous !== undefined) yield* Fiber.interrupt(previous);
			if (at === undefined) return;
			const delay = at - (yield* Clock.currentTimeMillis) + CACHE_WARM_LAG_MS;
			if (delay <= 0) return;
			self.warmFiber = yield* Effect.forkScoped(
				Effect.sleep(delay).pipe(
					Effect.andThen(
						Effect.sync(() => {
							self.warmAt = undefined;
							self.warmFiber = undefined;
						}),
					),
					Effect.andThen(self.publishReadings()),
				),
			);
		});
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

	/**
	 * A built-in command took its name from an extension command, so the extension one
	 * cannot be reached from `/`. Say so once per name (invariant 10: no silent drop).
	 */
	private reportShadowedCommands(): void {
		for (const name of shadowedCommandsOf(this.runtime.session)) {
			if (this.reportedShadowed.has(name)) continue;
			this.reportedShadowed.add(name);
			this.notice(
				`An extension command named /${name} is shadowed by pi's built-in /${name}, so the built-in runs here.`,
				"notice",
			);
		}
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
			if (item.kind === "arm") {
				yield* self.armWarming();
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
			self.reportShadowedCommands();
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
					if (entry.role === "assistant") yield* self.publishReadings();
					return;
				}
				case "entry_appended":
					if (event.entry.type === "session_info") {
						self.broadcast(self.metaOf(self.runtime.session));
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
					self.broadcast(
						withDefined(
							{
								entryId: self.toolEntries.get(event.toolCallId) ?? "",
								output: undefined,
								status: "running" as const,
								t: "toolDelta" as const,
								toolCallId: event.toolCallId,
								toolName: event.toolName,
							},
							"parentToolCallId",
							event.parentToolCallId,
						),
					);
					self.sendStatus();
					return;
				case "tool_execution_update":
					self.broadcast(
						withDefined(
							{
								entryId: self.toolEntries.get(event.toolCallId) ?? "",
								output: toolTextOf(event.partialResult),
								status: "running" as const,
								t: "toolDelta" as const,
								toolCallId: event.toolCallId,
								toolName: event.toolName,
							},
							"parentToolCallId",
							event.parentToolCallId,
						),
					);
					return;
				case "tool_execution_end":
					self.toolRunning = Math.max(0, self.toolRunning - 1);
					self.broadcast(
						withDefined(
							{
								durationMs: event.durationMs,
								entryId: self.toolEntries.get(event.toolCallId) ?? "",
								output: toolTextOf(event.result),
								status: event.isError ? ("error" as const) : ("ok" as const),
								t: "toolDelta" as const,
								toolCallId: event.toolCallId,
								toolName: event.toolName,
							},
							"parentToolCallId",
							event.parentToolCallId,
						),
					);
					self.sendStatus();
					return;
				case "compaction_start":
					self.broadcast({ busy: true, compacting: true, t: "busy" });
					return;
				case "compaction_end":
					self.broadcast({ busy: self.runtime.session.isStreaming, compacting: false, t: "busy" });
					yield* self.publishReadings();
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
					self.broadcast(self.metaOf(self.runtime.session));
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
