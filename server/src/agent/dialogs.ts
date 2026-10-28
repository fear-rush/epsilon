/**
 * The extension dialogs and display state a browser tab can see. pi's engine
 * blocks a tool call until a dialog is answered, so the pending set lives here
 * and is replayed to every late-attaching tab (docs/protocol.md).
 */
import type { DialogAnswer, DialogQuestion, ExtensionDisplay, ServerFrame } from "shared";

/** One unanswered dialog, with the resolver the browser's answer settles. */
type PendingDialog = {
	question: DialogQuestion;
	resolve: (answer: DialogAnswer) => void;
	timer: ReturnType<typeof setTimeout> | undefined;
};

/** The two methods that carry state across attaches, and how to key them. */
const displayKey = (request: ExtensionDisplay): string | undefined => {
	if (request.method === "setStatus") return `status:${request.statusKey}`;
	if (request.method === "setWidget") return `widget:${request.widgetKey}`;
	return undefined;
};

const isCleared = (request: ExtensionDisplay): boolean =>
	(request.method === "setStatus" && request.statusText === undefined) ||
	(request.method === "setWidget" && request.widgetLines === undefined);

/** A socket, or anything else that wants this session's frames. */
export type FrameSink = (frame: ServerFrame) => void;

export class Dialogs {
	private readonly sessionId: string;
	private readonly emit: (frame: ServerFrame) => void;
	private readonly onMeta: () => void;
	private readonly pending = new Map<string, PendingDialog>();
	/**
	 * Keyed display state an extension set and has not cleared, so a tab that
	 * attaches later sees the current status and widgets instead of nothing.
	 */
	private readonly displayState = new Map<string, ExtensionDisplay>();
	/** Methods that need pi's TUI, already reported, so a loop cannot spam. */
	private readonly reported = new Set<string>();

	constructor(sessionId: string, emit: (frame: ServerFrame) => void, onMeta: () => void) {
		this.sessionId = sessionId;
		this.emit = emit;
		this.onMeta = onMeta;
	}

	get needsInput(): boolean {
		return this.pending.size > 0;
	}

	ask = (question: DialogQuestion, timeoutMs?: number): Promise<DialogAnswer> =>
		new Promise<DialogAnswer>((resolve) => {
			const timer =
				timeoutMs === undefined
					? undefined
					: setTimeout(() => {
							this.pending.delete(question.id);
							resolve({ id: question.id, cancelled: true });
							this.emit({ t: "dialog-closed", sessionId: this.sessionId, id: question.id });
							this.onMeta();
						}, timeoutMs);
			this.pending.set(question.id, { question, resolve, timer });
			this.emit({ t: "dialog", sessionId: this.sessionId, request: question });
			this.onMeta();
		});

	/** Answer one dialog. The first answer wins; a repeat is ignored. */
	answer(answer: DialogAnswer): boolean {
		const pending = this.pending.get(answer.id);
		if (pending === undefined) return false;
		this.pending.delete(answer.id);
		if (pending.timer !== undefined) clearTimeout(pending.timer);
		pending.resolve(answer);
		this.emit({ t: "dialog-closed", sessionId: this.sessionId, id: answer.id });
		this.onMeta();
		return true;
	}

	/** Close every dialog as cancelled. An abort must not leave one hanging. */
	cancelAll(): void {
		if (this.pending.size === 0) return;
		for (const [id, pending] of this.pending) {
			if (pending.timer !== undefined) clearTimeout(pending.timer);
			pending.resolve({ id, cancelled: true });
			this.emit({ t: "dialog-closed", sessionId: this.sessionId, id });
		}
		this.pending.clear();
		this.onMeta();
	}

	/** Give a late subscriber the unanswered dialogs and the keyed display state. */
	replay(sink: FrameSink): void {
		for (const pending of this.pending.values()) {
			sink({ t: "dialog", sessionId: this.sessionId, request: pending.question });
		}
		for (const request of this.displayState.values()) {
			sink({ t: "ui", sessionId: this.sessionId, request });
		}
	}

	/** Forward a display-only request, remembering the keyed ones. */
	display = (request: ExtensionDisplay): void => {
		const key = displayKey(request);
		if (key !== undefined) {
			if (isCleared(request)) this.displayState.delete(key);
			else this.displayState.set(key, request);
		}
		this.emit({ t: "ui", sessionId: this.sessionId, request });
	};

	/** Say once that a TUI-only method has no browser equivalent. */
	unsupported = (method: string): void => {
		if (this.reported.has(method)) return;
		this.reported.add(method);
		this.display({
			method: "notify",
			message: `An extension used ${method}, which needs the terminal tab.`,
			notifyType: "warning",
		});
	};

	/**
	 * Report methods that ran before any tab attached, as one notice. An
	 * extension's session_start often touches several TUI methods at once.
	 */
	reportUnsupported = (methods: Iterable<string>): void => {
		const fresh = [...methods].filter((method) => !this.reported.has(method));
		if (fresh.length === 0) return;
		for (const method of fresh) this.reported.add(method);
		this.display({
			method: "notify",
			message: `Extensions use ${fresh.join(", ")}, which need the terminal tab.`,
			notifyType: "warning",
		});
	};
}
