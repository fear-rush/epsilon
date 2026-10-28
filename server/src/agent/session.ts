/**
 * One live engine session and the state the browser cannot rebuild by itself.
 * The transcript is pi's session file; the dialogs and display state live in
 * `dialogs.ts`. There is no child and no RPC envelope: a command is a method
 * call on the embedded `AgentSession` (ADR-0008, ADR-0009).
 */
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { isVisibleMessage } from "shared";
import type { Command, DialogAnswer, ServerFrame, Snapshot, SnapshotCommand } from "shared";

import { Dialogs } from "./dialogs";
import type { FrameSink } from "./dialogs";
import { createEngine, toJsonEvent } from "./engine";
import type { UiHost } from "./engine";

export type LiveSessionOptions = {
	sessionId: string;
	cwd: string;
	agentHome: string;
	/** Called once this session has disposed itself, so the registry drops it. */
	onEmpty: () => void;
};

const commandsOf = (agent: AgentSession): SnapshotCommand[] => {
	const commands: SnapshotCommand[] = [];
	for (const command of agent.extensionRunner.getRegisteredCommands()) {
		commands.push({
			name: command.invocationName,
			description: command.description,
			source: "extension",
		});
	}
	for (const template of agent.promptTemplates) {
		commands.push({ name: template.name, description: template.description, source: "prompt" });
	}
	for (const skill of agent.resourceLoader.getSkills().skills) {
		commands.push({
			name: `skill:${skill.name}`,
			description: skill.description,
			source: "skill",
		});
	}
	return commands;
};

export class LiveSession {
	readonly sessionId: string;
	private readonly onEmpty: () => void;
	private readonly subscribers = new Set<FrameSink>();
	private readonly dialogs: Dialogs;
	private agent: AgentSession | undefined;
	private unsubscribe: (() => void) | undefined;
	private streaming = false;
	private bashUnsettled = false;
	private disposed = false;

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
		this.subscribers.add(sink);
		this.dialogs.replay(sink);
		this.sendMetaTo(sink);
		sink(this.snapshotFrame());
		return () => {
			this.subscribers.delete(sink);
			if (this.subscribers.size === 0) this.dispose();
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
				await agent.steer(command.text, undefined, { source: "rpc" });
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
				// Re-reads extensions, skills, packages and MCP config in place. The
				// session object and its transcript stay.
				await agent.reload();
				this.resync();
				return;
			case "set_model": {
				const models = agent.modelRuntime.getAvailableSnapshot();
				const model = models.find(
					(candidate) =>
						candidate.provider === command.provider && candidate.id === command.modelId,
				);
				if (model === undefined) {
					throw new Error(`Model not found: ${command.provider}/${command.modelId}`);
				}
				await agent.setModel(model);
				this.resync();
				return;
			}
		}
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
					source: "rpc",
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
			unsupported: this.dialogs.unsupported,
			fail: (error) => this.fail(error),
		};
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
		const agent = this.engine;
		const model = agent.model;
		const snapshot: Snapshot = {
			state: {
				model:
					model === undefined
						? undefined
						: { provider: model.provider, id: model.id, name: model.name },
				isStreaming: agent.isStreaming,
				isCompacting: agent.isCompacting,
				sessionName: agent.sessionName,
			},
			messages: agent.messages.filter(isVisibleMessage),
			models: agent.modelRuntime.getAvailableSnapshot().map((candidate) => ({
				provider: candidate.provider,
				id: candidate.id,
				name: candidate.name,
			})),
			commands: commandsOf(agent),
		};
		return { t: "snapshot", sessionId: this.sessionId, snapshot };
	}

	/** Re-read the snapshot for everyone watching, after the engine changed. */
	private resync(): void {
		if (!this.isOpen) return;
		for (const sink of this.subscribers) sink(this.snapshotFrame());
	}

	private sendMeta(): void {
		for (const sink of this.subscribers) this.sendMetaTo(sink);
	}

	private sendMetaTo(sink: FrameSink): void {
		sink({ t: "meta", sessionId: this.sessionId, needsInput: this.dialogs.needsInput });
	}

	private emit(frame: ServerFrame): void {
		for (const sink of this.subscribers) sink(frame);
	}
}
