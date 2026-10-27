/**
 * Owns one `pi --mode rpc` child: the spawn, the stdout JSONL framing, writing
 * commands, and reporting the exit.
 *
 * The child is a cache. The session file on disk is the truth (ADR-0001), so
 * nothing here persists state. pi's own `RpcClient` is not used: it cannot
 * answer an extension dialog, which a tool call blocks on, it reports no child
 * exit, and it always spawns `node`. See
 * docs/notes/2026-10-28-rpc-permission-block.md.
 */
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type {
	JsonAgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "@earendil-works/pi-coding-agent";
import { z } from "zod";

/** Enough stderr to explain a crash, not enough to grow without a bound. */
const STDERR_TAIL_BYTES = 8_000;
/** Time a child gets to exit on SIGTERM before SIGKILL. */
const KILL_GRACE_MS = 2_000;
/** Time a command may wait for its correlated reply. */
const REQUEST_TIMEOUT_MS = 20_000;

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve("@earendil-works/pi-coding-agent/package.json");
const packageSchema = z.object({ bin: z.object({ pi: z.string() }) });

/** The pinned CLI entry, so a `pi` on `PATH` cannot shadow it. */
const piBinPath = join(
	dirname(packageJsonPath),
	packageSchema.parse(require(packageJsonPath)).bin.pi,
);

/**
 * Everything the child writes. pi keeps these apart: `RpcResponse` and
 * `RpcExtensionUIRequest` are not members of `JsonAgentSessionEvent`.
 */
export type AgentFrame = JsonAgentSessionEvent | RpcResponse | RpcExtensionUIRequest;

/** Everything we may write: commands plus answers to extension dialogs. */
export type AgentCommand = RpcCommand | RpcExtensionUIResponse;

/**
 * Which session the child works on. Never omitted: the default would resume or
 * create a file the browser did not ask for.
 */
export type SessionTarget = { kind: "id"; id: string } | { kind: "file"; path: string };

export type ExitInfo = {
	code: number | null;
	signal: string | null;
	stderr: string;
	/** True when we asked for the exit, so the UI can tell a stop from a crash. */
	requested: boolean;
};

export type DriverOptions = {
	session: SessionTarget;
	cwd: string;
	onFrame: (frame: AgentFrame) => void;
	onExit: (info: ExitInfo) => void;
};

const sessionArgs = (session: SessionTarget): string[] =>
	session.kind === "id" ? ["--session-id", session.id] : ["--session", session.path];

const frameSchema = z.looseObject({ type: z.string() });

export class Driver {
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly options: DriverOptions;
	private stderr = "";
	private pending = "";
	private exited = false;
	private killRequested = false;
	private readonly waiting = new Map<
		string,
		{ resolve: (r: RpcResponse) => void; reject: (e: Error) => void }
	>();

	constructor(options: DriverOptions) {
		this.options = options;
		this.child = spawn(piBinPath, ["--mode", "rpc", ...sessionArgs(options.session)], {
			cwd: options.cwd,
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => this.read(chunk));
		this.child.stderr.setEncoding("utf8");
		this.child.stderr.on("data", (chunk: string) => this.collectStderr(chunk));
		this.child.on("exit", (code, signal) => this.finish(code, signal));
		// A spawn failure never emits `exit`, so report it as one. The guard in
		// `finish` keeps a later `exit` from reporting twice.
		this.child.on("error", (error) => {
			this.collectStderr(`\nspawn failed: ${error.message}\n`);
			this.finish(null, null);
		});
	}

	get running(): boolean {
		return !this.exited;
	}

	/** Write one command. Throws when the child is already gone. */
	send(command: AgentCommand): void {
		if (this.exited) throw new Error("Agent driver is not running");
		this.child.stdin.write(`${JSON.stringify(command)}\n`);
	}

	/**
	 * Send a command and wait for the reply carrying the same `id`. pi echoes it,
	 * which is the only correlation the protocol offers.
	 */
	async request(command: RpcCommand, timeoutMs = REQUEST_TIMEOUT_MS): Promise<RpcResponse> {
		const id = crypto.randomUUID();
		const reply = new Promise<RpcResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiting.delete(id);
				reject(new Error(`No reply to ${command.type} within ${timeoutMs}ms`));
			}, timeoutMs);
			this.waiting.set(id, {
				resolve: (response) => {
					clearTimeout(timer);
					resolve(response);
				},
				reject,
			});
		});
		this.send({ ...command, id });
		return reply;
	}

	/** Ask the child to stop, then insist after the grace period. */
	kill(): void {
		if (this.exited) return;
		this.killRequested = true;
		this.child.kill("SIGTERM");
		const force = setTimeout(() => this.child.kill("SIGKILL"), KILL_GRACE_MS);
		force.unref();
	}

	private collectStderr(chunk: string): void {
		this.stderr = `${this.stderr}${chunk}`.slice(-STDERR_TAIL_BYTES);
	}

	private read(chunk: string): void {
		this.pending += chunk;
		let newline = this.pending.indexOf("\n");
		while (newline !== -1) {
			this.emitLine(this.pending.slice(0, newline));
			this.pending = this.pending.slice(newline + 1);
			newline = this.pending.indexOf("\n");
		}
	}

	private emitLine(line: string): void {
		const trimmed = line.trim();
		if (trimmed === "") return;
		const parsed = parseJsonLine(trimmed);
		if (parsed === undefined) {
			this.collectStderr(`\nunparsed stdout line: ${trimmed.slice(0, 200)}\n`);
			return;
		}
		if (parsed.type === "response") this.settle(parsed);
		// SAFETY: `parseJsonLine` returned a JSON object whose `type` is a string, and
		// pi owns every other field. agent/normalize.ts is the single place that
		// reads their shapes, so the driver forwards the frame untouched.
		this.options.onFrame(parsed);
	}

	/** Hand a correlated reply to its waiting request, if any. */
	private settle(response: RpcResponse): void {
		if (response.id === undefined) return;
		const waiting = this.waiting.get(response.id);
		if (waiting === undefined) return;
		this.waiting.delete(response.id);
		waiting.resolve(response);
	}

	private finish(code: number | null, signal: string | null): void {
		if (this.exited) return;
		this.exited = true;
		for (const waiting of this.waiting.values()) {
			waiting.reject(new Error("The agent exited before replying"));
		}
		this.waiting.clear();
		if (this.pending.trim() !== "") this.emitLine(this.pending);
		this.pending = "";
		this.options.onExit({
			code,
			signal,
			stderr: this.stderr.trim(),
			requested: this.killRequested,
		});
	}
}

/** A JSON object with a string `type`, or undefined when pi wrote something else. */
const parseJsonLine = (line: string): AgentFrame | undefined => {
	try {
		// SAFETY: the schema proves a JSON object with a string `type`; pi owns the
		// remaining fields.
		return frameSchema.parse(JSON.parse(line)) as AgentFrame;
	} catch {
		return undefined;
	}
};
