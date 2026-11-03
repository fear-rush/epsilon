import {
	Clock,
	Deferred,
	Effect,
	Exit,
	Option,
	PubSub,
	Queue,
	Ref,
	Schema,
	Scope,
	Stream,
} from "effect";

import type { ServerFrame } from "#protocol/conversation/frames";
import type { SupervisorToEngine } from "#protocol/engine-ipc";
import { EngineToSupervisor as EngineMessage } from "#protocol/engine-ipc";
import { CommandRefused, EngineStopped } from "#protocol/errors";

import type { ChildHandle, IpcMessage } from "../platform/process.ts";
import { spawnChild } from "../platform/process.ts";

/**
 * One engine process, as the backend sees it: an IPC channel, the last thing it said
 * about itself, and a queue of frames per tab.
 *
 * The process is spawned here and nowhere else. Its lifetime is a scope this file owns,
 * so a crash, an idle close and shutdown all end in the same `Scope.close`, which sends
 * SIGKILL to the whole group if the child is still there.
 */

export type EngineSpec = {
	readonly command: ReadonlyArray<string>;
	readonly env: Record<string, string>;
};

export type ExitInfo = {
	readonly code: number;
	readonly signal: string | null;
};

export type Status = {
	readonly sessionId: string;
	readonly busy: boolean;
	readonly needsInput: boolean;
};

export type Heartbeat = {
	readonly seq: number;
	readonly loopLagMs: number;
	readonly rss: number;
	readonly heapUsed: number;
	readonly childPids: ReadonlyArray<number>;
	/** Backend time, so a watchdog compares clocks, not the child's word for it. */
	readonly at: number;
};

export type LifecycleEvent =
	| { readonly type: "status"; readonly status: Status }
	| { readonly type: "heartbeat"; readonly heartbeat: Heartbeat }
	| { readonly type: "rekey"; readonly from: string; readonly to: string }
	| { readonly type: "fatal"; readonly message: string; readonly stack: string | undefined }
	| {
			readonly type: "log";
			readonly level: "debug" | "info" | "warn" | "error";
			readonly message: string;
			readonly fields: Record<string, string | number | boolean> | undefined;
	  }
	| { readonly type: "idle" }
	| { readonly type: "exit"; readonly info: ExitInfo };

type StoppedFields = { sessionId: string; exitCode: number; signal?: string };

export type RequestMessage =
	| Omit<Extract<SupervisorToEngine, { t: "command" }>, "id">
	| Omit<Extract<SupervisorToEngine, { t: "query" }>, "id">;

const decodeEngine = Schema.decodeUnknownOption(EngineMessage);
const requestTimeout = "30 seconds";

const describe = (cause: unknown): string =>
	cause instanceof Error ? cause.message : String(cause);

export class RemoteEngine {
	readonly sessionId: Ref.Ref<string>;
	readonly status: Ref.Ref<Status>;
	readonly heartbeat: Ref.Ref<Heartbeat | undefined>;
	readonly events: Stream.Stream<LifecycleEvent>;
	readonly pid: number;
	readonly startedAt: number;
	private readonly scope: Scope.Closeable;
	private readonly handle: ChildHandle;
	private readonly pubsub: PubSub.PubSub<LifecycleEvent>;
	private readonly pending = new Map<
		string,
		Deferred.Deferred<unknown, CommandRefused | EngineStopped>
	>();
	private readonly tabs = new Map<string, Queue.Queue<ServerFrame>>();
	private readonly exit: Deferred.Deferred<ExitInfo>;
	private readonly ready: Deferred.Deferred<void>;
	private readonly logLines: Ref.Ref<ReadonlyArray<string>>;
	private readonly exitInfo = Ref.makeUnsafe<ExitInfo | undefined>(undefined);
	private stopping = false;

	constructor(options: {
		readonly scope: Scope.Closeable;
		readonly handle: ChildHandle;
		readonly sessionId: string;
		readonly pubsub: PubSub.PubSub<LifecycleEvent>;
		readonly exit: Deferred.Deferred<ExitInfo>;
		readonly ready: Deferred.Deferred<void>;
		readonly logLines: Ref.Ref<ReadonlyArray<string>>;
		readonly startedAt: number;
	}) {
		this.scope = options.scope;
		this.handle = options.handle;
		this.pid = options.handle.pid;
		this.pubsub = options.pubsub;
		this.exit = options.exit;
		this.ready = options.ready;
		this.logLines = options.logLines;
		this.sessionId = Ref.makeUnsafe(options.sessionId);
		const initial: Status = { busy: false, needsInput: false, sessionId: options.sessionId };
		this.status = Ref.makeUnsafe(initial);
		this.heartbeat = Ref.makeUnsafe<Heartbeat | undefined>(undefined);
		this.startedAt = options.startedAt;
		this.events = Stream.fromPubSub(options.pubsub);
	}

	get isStopping(): boolean {
		return this.stopping;
	}

	get currentSessionId(): string {
		return Ref.getUnsafe(this.sessionId);
	}

	get waitReady(): Effect.Effect<void> {
		return Deferred.await(this.ready);
	}

	get waitExit(): Effect.Effect<ExitInfo> {
		return Deferred.await(this.exit);
	}

	get lastHeartbeat(): Effect.Effect<Heartbeat | undefined> {
		return Ref.get(this.heartbeat);
	}

	get currentStatus(): Effect.Effect<Status> {
		return Ref.get(this.status);
	}

	get recentLogLines(): Effect.Effect<ReadonlyArray<string>> {
		return Ref.get(this.logLines);
	}

	send(message: SupervisorToEngine): Effect.Effect<void> {
		return Effect.sync(() => {
			this.handle.send(message);
		});
	}

	/** A command or query, answered by `reply`; a child that never answers times out. */
	request(
		make: (id: string) => RequestMessage,
	): Effect.Effect<unknown, CommandRefused | EngineStopped> {
		const gone = Ref.getUnsafe(this.exitInfo);
		if (gone !== undefined) return Effect.fail(this.stoppedError(gone));
		const id = crypto.randomUUID();
		const deferred = Deferred.makeUnsafe<unknown, CommandRefused | EngineStopped>();
		this.pending.set(id, deferred);
		return this.send({ ...make(id), id }).pipe(
			Effect.andThen(
				Deferred.await(deferred).pipe(
					Effect.timeoutOrElse({
						duration: requestTimeout,
						orElse: () =>
							Effect.fail(
								new CommandRefused({
									command: "engine",
									reason: "The engine did not answer in 30 s.",
								}),
							),
					}),
				),
			),
		);
	}

	attachTab(tab: string): Effect.Effect<void> {
		return Effect.gen({ self: this }, function* () {
			if (this.tabs.has(tab)) return;
			const queue = yield* Queue.sliding<ServerFrame>(1024);
			this.tabs.set(tab, queue);
			yield* this.send({ t: "subscribe", tab });
		});
	}

	detachTab(tab: string): Effect.Effect<void> {
		return Effect.gen({ self: this }, function* () {
			const queue = this.tabs.get(tab);
			if (queue === undefined) return;
			this.tabs.delete(tab);
			yield* Queue.shutdown(queue);
			yield* this.send({ t: "unsubscribe", tab });
		});
	}

	frames(tab: string): Stream.Stream<ServerFrame> {
		const queue = this.tabs.get(tab);
		return queue === undefined ? Stream.empty : Stream.fromQueue(queue);
	}

	/** A supervisor notice, shown to every tab watching this chat. */
	broadcast(frame: ServerFrame): Effect.Effect<void> {
		return Effect.sync(() => {
			for (const queue of this.tabs.values()) Queue.offerUnsafe(queue, frame);
		});
	}

	toTab(tab: string, frame: ServerFrame): Effect.Effect<void> {
		return Effect.sync(() => {
			const queue = this.tabs.get(tab);
			if (queue !== undefined) Queue.offerUnsafe(queue, frame);
		});
	}

	forkIn<A, E, R>(work: Effect.Effect<A, E, R>): Effect.Effect<unknown, never, R> {
		return Effect.forkIn(work, this.scope);
	}

	/** Ask the engine to dispose and exit; the scope close is the guarantee. */
	stop(deadlineMs: number): Effect.Effect<void> {
		const self = this;
		return Effect.gen(function* () {
			if (self.stopping) return;
			self.stopping = true;
			yield* self.send({ deadlineMs, t: "shutdown" });
			yield* Deferred.await(self.exit).pipe(
				Effect.timeoutOrElse({ duration: `${deadlineMs} millis`, orElse: () => Effect.void }),
			);
			yield* Scope.close(self.scope, Exit.void);
		});
	}

	/**
	 * Kill the process group now. The exit is a crash, so the supervisor still records
	 * it; only `stop` marks the exit as the owner's decision.
	 */
	killNow(): Effect.Effect<void> {
		return Scope.close(this.scope, Exit.void);
	}

	/** Decode one message and apply it. Called by the consumer fiber only. */
	handleMessage(raw: IpcMessage): Effect.Effect<void> {
		const self = this;
		return Effect.gen(function* () {
			const decoded = decodeEngine(raw);
			if (Option.isNone(decoded)) {
				yield* self.publish({
					fields: undefined,
					level: "warn",
					message: "ignored a malformed engine message",
					type: "log",
				});
				return;
			}
			const message = decoded.value;
			switch (message.t) {
				case "ready":
					yield* Ref.set(self.sessionId, message.sessionId);
					yield* Deferred.succeed(self.ready, undefined);
					return;
				case "frame": {
					const target = message.to;
					if (target === "all") {
						for (const queue of self.tabs.values()) Queue.offerUnsafe(queue, message.frame);
					} else {
						const queue = self.tabs.get(target.tab);
						if (queue !== undefined) Queue.offerUnsafe(queue, message.frame);
					}
					return;
				}
				case "reply": {
					const pending = self.pending.get(message.id);
					if (pending === undefined) return;
					self.pending.delete(message.id);
					yield* message.ok
						? Deferred.succeed(pending, message.value)
						: Deferred.fail(
								pending,
								new CommandRefused({
									command: "engine",
									reason: message.error ?? "The engine refused the request.",
								}),
							);
					return;
				}
				case "rekey":
					yield* Ref.set(self.sessionId, message.to);
					yield* Ref.update(self.status, (status) => ({ ...status, sessionId: message.to }));
					yield* self.publish({ from: message.from, to: message.to, type: "rekey" });
					return;
				case "status": {
					const status = {
						busy: message.busy,
						needsInput: message.needsInput,
						sessionId: message.sessionId,
					};
					yield* Ref.set(self.status, status);
					yield* self.publish({ status, type: "status" });
					return;
				}
				case "heartbeat": {
					const at = yield* Clock.currentTimeMillis;
					const heartbeat: Heartbeat = {
						at,
						childPids: message.childPids,
						heapUsed: message.heapUsed,
						loopLagMs: message.loopLagMs,
						rss: message.rss,
						seq: message.seq,
					};
					yield* Ref.set(self.heartbeat, heartbeat);
					yield* self.publish({ heartbeat, type: "heartbeat" });
					return;
				}
				case "fatal":
					yield* self.publish({
						message: message.message,
						stack: message.stack,
						type: "fatal",
					});
					return;
				case "log": {
					const line = `${message.level}: ${message.message}`;
					yield* Ref.update(self.logLines, (lines) => [...lines.slice(-49), line]);
					yield* self.publish({
						fields: message.fields,
						level: message.level,
						message: message.message,
						type: "log",
					});
					return;
				}
				case "idle":
					yield* self.publish({ type: "idle" });
					return;
				default:
					return;
			}
		});
	}

	publish(event: LifecycleEvent): Effect.Effect<void> {
		return PubSub.publish(this.pubsub, event).pipe(Effect.asVoid);
	}

	/** The child is gone: fail what waited on it and tell the listeners once. */
	finish(info: ExitInfo): Effect.Effect<void> {
		return Effect.gen({ self: this }, function* () {
			for (const [id, deferred] of this.pending) {
				this.pending.delete(id);
				yield* Deferred.fail(deferred, this.stoppedError(info));
			}
			yield* Ref.set(this.exitInfo, info);
			yield* Deferred.succeed(this.exit, info);
			yield* this.publish({ info, type: "exit" });
		});
	}

	/** The sentence a person can act on when the process is gone. */
	stoppedError(info: ExitInfo): EngineStopped {
		const fields: StoppedFields = { exitCode: info.code, sessionId: this.currentSessionId };
		if (info.signal !== null) fields.signal = info.signal;
		return new EngineStopped(fields);
	}
}

/** The heartbeat's sentence, for a person reading a crash record. */
export const describeExit = (info: ExitInfo): string =>
	info.signal === null ? `exit ${info.code}` : `signal ${info.signal}`;

export { describe };

/** Spawn one engine and wait until it says `ready`. */
export type StartOptions = {
	readonly spec: EngineSpec;
	readonly sessionId: string;
	readonly cwd: string;
	readonly file: string | undefined;
	readonly place: string | null;
	readonly homeDir: string;
	readonly userHome: string;
};

export const startEngine = (options: StartOptions): Effect.Effect<RemoteEngine, EngineStopped> =>
	Effect.gen(function* () {
		const scope = yield* Scope.make();
		const watchScope = yield* Scope.make();
		const messages = yield* Queue.unbounded<IpcMessage>();
		const pubsub = yield* PubSub.unbounded<LifecycleEvent>();
		const logLines = yield* Ref.make<ReadonlyArray<string>>([]);
		const startedAt = yield* Clock.currentTimeMillis;
		const ready = yield* Deferred.make<void>();
		const exit = yield* Deferred.make<ExitInfo>();

		const handle = yield* spawnChild({
			command: options.spec.command,
			env: options.spec.env,
			inheritStdio: true,
			ipc: true,
			onMessage: (message) => {
				Queue.offerUnsafe(messages, message);
			},
		}).pipe(Effect.provideService(Scope.Scope, scope));

		const engine = new RemoteEngine({
			exit,
			handle,
			logLines,
			pubsub,
			ready,
			scope,
			sessionId: options.sessionId,
			startedAt,
		});

		yield* Effect.forkIn(
			Effect.gen(function* () {
				for (;;) {
					const raw = yield* Queue.take(messages);
					yield* engine.handleMessage(raw);
				}
			}),
			scope,
		);
		// The exit watcher is not part of the engine's scope: a kill closes that scope,
		// and the event that says why must still reach the supervisor and the registry.
		yield* Effect.forkIn(
			Effect.gen(function* () {
				const code = yield* Effect.promise(() => handle.exited);
				yield* engine.finish({ code, signal: null });
				yield* Scope.close(watchScope, Exit.void);
			}),
			watchScope,
		);
		yield* engine.send({
			cwd: options.cwd,
			file: options.file ?? null,
			homeDir: options.homeDir,
			place: options.place,
			sessionId: options.sessionId,
			t: "init",
			userHome: options.userHome,
		});

		return yield* Effect.raceFirst(
			Deferred.await(ready).pipe(Effect.as<"ready">("ready")),
			Deferred.await(exit).pipe(Effect.as<"exit">("exit")),
		).pipe(
			Effect.timeoutOrElse({
				duration: "10 seconds",
				orElse: () => Effect.fail(new EngineStopped({ sessionId: options.sessionId })),
			}),
			Effect.flatMap((outcome) =>
				outcome === "exit"
					? Effect.fail(new EngineStopped({ sessionId: options.sessionId }))
					: Effect.succeed(engine),
			),
			Effect.matchEffect({
				onFailure: (error) =>
					Scope.close(scope, Exit.void).pipe(
						Effect.andThen(Scope.close(watchScope, Exit.void)),
						Effect.andThen(Effect.fail(error)),
					),
				onSuccess: () => Effect.succeed(engine),
			}),
		);
	});
