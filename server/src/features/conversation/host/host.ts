/**
 * One pi `AgentSessionRuntime` per live chat.
 *
 * The runtime owns the session, the cwd-bound services and the replacement
 * operations, so this class holds only what a web host adds: it opens the runtime
 * from the shared factory, lets the session's owner register bindings and
 * observers, and names the session ids a replacement passed through
 * (docs/DECISIONS.md, Embedded engine).
 */
import { createAgentSessionRuntime } from "@earendil-works/pi-coding-agent";
import type {
	AgentSession,
	AgentSessionRuntime,
	CreateAgentSessionRuntimeFactory,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";

import type { AgentHome } from "../../../platform/agent-home";
import { createRuntimeFactory, openSessionManager } from "./factory";
import type { SettingsProblem } from "./factory";
import { bindHost } from "./bindings";
import type { McpReportSink } from "../extensions/mcp-observer";
import type { UiHost } from "../ui-context";

/** Why pi built the session a host holds now; the same words as `session_start`. */
export type SessionReason = SessionStartEvent["reason"];

/** A replacement that changed the id: what a tab has to follow. */
export type Replacement = { from: string; to: string; reason: SessionReason };

/**
 * Every session a runtime swaps in, including an operation cancelled before the
 * swap. Bindings and re-subscription belong here, not on `onReplaced`: a session
 * object is replaced even when its id is not.
 */
type SwapListener = (session: AgentSession) => void | Promise<void>;

/** The reason pi gave for the session it is applying, read before the rebind hook. */
type ReasonBox = { current: SessionReason };

export type HostOptions = {
	home: AgentHome;
	cwd: string;
	/** Where a session with no file yet starts; ignored once `file` is set. */
	sessionId: string;
	file: string | undefined;
	chat: boolean;
	/** Where the MCP observer reports; absent for a copy, which has no panel. */
	onMcpReport?: McpReportSink;
	/** Where a settings file pi could not load is reported. */
	onSettingsReport?: (problems: SettingsProblem[]) => void;
	/** Where a `project_trust` handler's error is reported. */
	onTrustReport?: (problems: string[]) => void;
};

export class SessionHost {
	private readonly sessionRuntime: AgentSessionRuntime;
	private readonly swaps = new Set<SwapListener>();
	private readonly replacements = new Set<(replacement: Replacement) => void>();
	private readonly shutdowns = new Set<() => void>();
	private readonly reason: ReasonBox;
	private shutdownAsked = false;

	private constructor(runtime: AgentSessionRuntime, reason: ReasonBox) {
		this.sessionRuntime = runtime;
		this.reason = reason;
		// pi calls this after every replacement, once the new session is applied. It
		// is the one hook that fires for a swap whose id did not change.
		runtime.setRebindSession(async (session) => {
			for (const listener of [...this.swaps]) await listener(session);
		});
	}

	static async open(options: HostOptions): Promise<SessionHost> {
		// The reason travels in `session_start`, which pi builds for the session it is
		// about to apply; the factory sees it before the rebind hook runs.
		const reason: ReasonBox = { current: "startup" };
		const factory = createRuntimeFactory({
			home: options.home,
			chat: options.chat,
			onMcpReport: options.onMcpReport,
			onSettingsReport: options.onSettingsReport,
			onTrustReport: options.onTrustReport,
		});
		const tracked: CreateAgentSessionRuntimeFactory = async (input) => {
			reason.current = input.sessionStartEvent?.reason ?? "startup";
			return factory(input);
		};
		const runtime = await createAgentSessionRuntime(tracked, {
			cwd: options.cwd,
			agentDir: options.home.dir,
			sessionManager: openSessionManager(
				options.cwd,
				options.sessionId,
				options.file,
				options.home,
			),
		});
		return new SessionHost(runtime, reason);
	}

	/** The runtime itself. Read `session` off it; never cache one. */
	get runtime(): AgentSessionRuntime {
		return this.sessionRuntime;
	}

	get session(): AgentSession {
		return this.sessionRuntime.session;
	}

	/** Read live: a replacement changes it under everything that holds the host. */
	get id(): string {
		return this.sessionRuntime.session.sessionId;
	}

	get cwd(): string {
		return this.sessionRuntime.cwd;
	}

	get file(): string | undefined {
		return this.sessionRuntime.session.sessionFile;
	}

	get startReason(): SessionReason {
		return this.reason.current;
	}

	/** Run after every swap, in registration order. Register bindings first. */
	onSwap(listener: SwapListener): () => void {
		this.swaps.add(listener);
		return () => this.swaps.delete(listener);
	}

	/**
	 * Run after a swap that changed the id. The registry re-keys on this so a stale
	 * tab reaches the live chat instead of opening a second writer on its file.
	 */
	onReplaced(listener: (replacement: Replacement) => void): () => void {
		this.replacements.add(listener);
		return () => this.replacements.delete(listener);
	}

	/**
	 * Run one replacement on this runtime. pi rebinds the new session itself, so
	 * this only reports the id change; a run that throws after the swap still
	 * reports it, because the chat is on the new session either way.
	 */
	async replace<T>(run: (runtime: AgentSessionRuntime) => Promise<T>): Promise<T> {
		const from = this.id;
		try {
			return await run(this.sessionRuntime);
		} finally {
			if (this.id !== from) {
				for (const listener of [...this.replacements]) {
					listener({ from, to: this.id, reason: this.startReason });
				}
			}
		}
	}

	/** Close the runtime: the only teardown that emits `session_shutdown`. */
	async close(): Promise<void> {
		this.swaps.clear();
		this.replacements.clear();
		this.shutdowns.clear();
		await this.sessionRuntime.dispose();
	}

	/**
	 * `ctx.shutdown()`: pi asks the host to stop. It names no extension, so the
	 * notice says an extension asked. The owner closes the engine once the work in
	 * flight is done, the way pi's own modes defer it.
	 */
	requestExtensionShutdown(): void {
		if (this.shutdownAsked) return;
		this.shutdownAsked = true;
		for (const listener of [...this.shutdowns]) listener();
	}

	get shutdownRequested(): boolean {
		return this.shutdownAsked;
	}

	onShutdownRequested(listener: () => void): () => void {
		this.shutdowns.add(listener);
		return () => this.shutdowns.delete(listener);
	}
}

/**
 * Build one host for a session file, bind it, run `run` on it and close it. A copy
 * is exactly this: a runtime for one request, which pi disposes after its `fork`
 * replaced the session it held (docs/DECISIONS.md, Session copies).
 */
export const withHost = async <Result>(
	options: HostOptions,
	ui: UiHost,
	run: (host: SessionHost) => Promise<Result>,
): Promise<Result> => {
	const host = await SessionHost.open(options);
	try {
		await bindHost(host, ui);
		return await run(host);
	} finally {
		await host.close();
	}
};
