import {
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
	AgentSession,
	AgentSessionRuntime,
	CreateAgentSessionFromServicesOptions,
	CreateAgentSessionRuntimeFactory,
	CreateAgentSessionRuntimeResult,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import { EngineRefused, EngineStartFailed } from "./errors.ts";
import { builtinExtensions } from "./extensions.ts";

/**
 * One pi `AgentSessionRuntime` for one live chat.
 *
 * The runtime owns the session, the cwd-bound services and every replacement (`/new`,
 * switch, fork), so this file adds only what a headless host needs: it opens the runtime
 * from pi's own factory, reports each new session id to its owner, and closes with the one
 * teardown that emits `session_shutdown`.
 */

export type RuntimeInput = {
	readonly agentDir: string;
	readonly cwd: string;
	/** The id a session without a file is created with; ignored once `file` names one. */
	readonly sessionId: string;
	readonly file: string | undefined;
};

export type Replacement = {
	readonly from: string;
	readonly to: string;
	readonly reason: SessionStartEvent["reason"];
};

type SwapListener = (session: AgentSession) => void;
type ReasonBox = { current: SessionStartEvent["reason"] };

const factoryFor =
	(agentDir: string): CreateAgentSessionRuntimeFactory =>
	async ({ cwd, sessionManager, sessionStartEvent }): Promise<CreateAgentSessionRuntimeResult> => {
		const services = await createAgentSessionServices({
			agentDir,
			cwd,
			resourceLoaderOptions: { extensionFactories: builtinExtensions() },
		});
		const options: CreateAgentSessionFromServicesOptions = { services, sessionManager };
		if (sessionStartEvent !== undefined) options.sessionStartEvent = sessionStartEvent;
		const created = await createAgentSessionFromServices(options);
		return { ...created, diagnostics: services.diagnostics, services };
	};

const openSessionManager = (input: RuntimeInput): SessionManager =>
	input.file === undefined
		? SessionManager.create(input.cwd, undefined, { id: input.sessionId })
		: SessionManager.open(input.file, undefined, input.cwd);

export class RuntimeHandle {
	private readonly runtime: AgentSessionRuntime;
	private readonly reason: ReasonBox;
	private readonly swaps = new Set<SwapListener>();
	private readonly replacements = new Set<(replacement: Replacement) => void>();

	private constructor(runtime: AgentSessionRuntime, reason: ReasonBox) {
		this.runtime = runtime;
		this.reason = reason;
		this.runtime.setRebindSession((session) => {
			for (const listener of Array.from(this.swaps)) listener(session);
			return Promise.resolve();
		});
	}

	static open(input: RuntimeInput): Effect.Effect<RuntimeHandle, EngineStartFailed> {
		return Effect.gen(function* () {
			const reason: ReasonBox = { current: "startup" };
			const factory = factoryFor(input.agentDir);
			const tracked: CreateAgentSessionRuntimeFactory = async (options) => {
				reason.current = options.sessionStartEvent?.reason ?? "startup";
				return factory(options);
			};
			const runtime = yield* Effect.tryPromise({
				try: () =>
					createAgentSessionRuntime(tracked, {
						agentDir: input.agentDir,
						cwd: input.cwd,
						sessionManager: openSessionManager(input),
					}),
				catch: (cause) =>
					new EngineStartFailed({ reason: describe(cause), sessionId: input.sessionId }),
			});
			return new RuntimeHandle(runtime, reason);
		});
	}

	get session(): AgentSession {
		return this.runtime.session;
	}

	/** Read live: a replacement changes it under everything that holds the handle. */
	get id(): string {
		return this.runtime.session.sessionId;
	}

	get file(): string | undefined {
		return this.runtime.session.sessionFile;
	}

	get cwd(): string {
		return this.runtime.cwd;
	}

	get startReason(): SessionStartEvent["reason"] {
		return this.reason.current;
	}

	get diagnostics(): ReadonlyArray<{ type: string; message: string }> {
		return this.runtime.diagnostics;
	}

	/** Run after every replacement, including one whose id did not change. */
	onSwap(listener: SwapListener): void {
		this.swaps.add(listener);
	}

	/** Run after a replacement that changed the id, so the supervisor can re-key. */
	onReplaced(listener: (replacement: Replacement) => void): void {
		this.replacements.add(listener);
	}

	/** One replacement pi owns: report the id change even when the operation throws after it. */
	replace<A>(run: (runtime: AgentSessionRuntime) => Promise<A>): Effect.Effect<A, EngineRefused> {
		const from = this.id;
		return Effect.tryPromise({
			try: () => run(this.runtime),
			catch: (cause) => new EngineRefused({ reason: describe(cause), what: "replace" }),
		}).pipe(
			Effect.ensuring(
				Effect.sync(() => {
					const to = this.id;
					if (to === from) return;
					for (const listener of Array.from(this.replacements)) {
						listener({ from, reason: this.startReason, to });
					}
				}),
			),
		);
	}

	/** The only teardown that emits `session_shutdown`; a plain `dispose` would not. */
	dispose(): Effect.Effect<void> {
		this.swaps.clear();
		this.replacements.clear();
		return Effect.tryPromise({
			try: () => this.runtime.dispose(),
			catch: (cause) => new EngineRefused({ reason: describe(cause), what: "dispose" }),
		}).pipe(Effect.orDie);
	}
}

/** A host error's sentence, without assuming it is an `Error`. */
export function describe(cause: unknown): string {
	if (cause instanceof Error) return cause.message;
	return String(cause);
}
