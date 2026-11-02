/**
 * The extension dialogs and display state a browser tab can see. pi's engine
 * blocks a tool call until a dialog is answered, so the pending set lives here
 * and is replayed to every late-attaching tab.
 */
import type { DialogAnswer, DialogQuestion, ExtensionDisplay, ServerFrame } from "shared";

/** What pi asked for alongside a question: a deadline, and a way to withdraw it. */
export type AskOptions = {
	/** Close the dialog after this long, as pi's own timed dialogs do. */
	timeoutMs?: number;
	/** pi's `signal`: the extension or its caller no longer wants an answer. */
	signal?: AbortSignal;
};

/** One unanswered dialog, with the resolver the browser's answer settles. */
type PendingDialog = {
	question: DialogQuestion;
	resolve: (answer: DialogAnswer) => void;
	timer: ReturnType<typeof setTimeout> | undefined;
	/** When the question expires, so a tab that attaches late counts from the same point. */
	deadline: number | undefined;
	signal: AbortSignal | undefined;
	onAbort: (() => void) | undefined;
};

/** Whether an answer settled a dialog, or why it did not. */
export type AnswerOutcome = "answered" | "stale" | "mismatch";

/**
 * The display methods that carry state across attaches, and how to key them. The
 * session-wide settings have no extension key of their own, so the method names them.
 */
const STICKY_METHODS = new Set<ExtensionDisplay["method"]>([
	"set_working_message",
	"set_working_visible",
	"set_hidden_thinking_label",
	"set_tools_expanded",
]);

const displayKey = (request: ExtensionDisplay): string | undefined => {
	if (request.method === "setStatus") return `status:${request.statusKey}`;
	if (request.method === "setWidget") return `widget:${request.widgetKey}`;
	if (STICKY_METHODS.has(request.method)) return `method:${request.method}`;
	return undefined;
};

const isCleared = (request: ExtensionDisplay): boolean =>
	(request.method === "setStatus" && request.statusText === undefined) ||
	(request.method === "setWidget" && request.widgetLines === undefined);

/** A socket, or anything else that wants this session's frames. */
export type FrameSink = (frame: ServerFrame) => void;

export class Dialogs {
	/** Read live: a replacement changes the id every frame must carry. */
	private readonly sessionId: () => string;
	private readonly emit: (frame: ServerFrame) => void;
	/** Called whenever the pending set changes, so the session can re-time its idle. */
	private readonly onChange: () => void;
	private readonly pending = new Map<string, PendingDialog>();
	/**
	 * Keyed display state an extension set and has not cleared, so a tab that
	 * attaches later sees the current status and widgets instead of nothing.
	 */
	private readonly displayState = new Map<string, ExtensionDisplay>();
	/** Methods that need pi's TUI, already reported, so a loop cannot spam. */
	private readonly reported = new Set<string>();

	constructor(sessionId: () => string, emit: (frame: ServerFrame) => void, onChange: () => void) {
		this.sessionId = sessionId;
		this.emit = emit;
		this.onChange = onChange;
	}

	get needsInput(): boolean {
		return this.pending.size > 0;
	}

	ask = (question: DialogQuestion, options: AskOptions = {}): Promise<DialogAnswer> =>
		new Promise<DialogAnswer>((resolve) => {
			// pi resolves an already-aborted dialog with its default and asks nothing.
			if (options.signal?.aborted === true) {
				resolve({ id: question.id, method: "cancel" });
				return;
			}
			const pending: PendingDialog = {
				question,
				resolve,
				timer: undefined,
				deadline: options.timeoutMs === undefined ? undefined : Date.now() + options.timeoutMs,
				signal: options.signal,
				onAbort: undefined,
			};
			pending.onAbort = () => this.dismiss(pending);
			if (options.timeoutMs !== undefined) {
				pending.timer = setTimeout(() => this.dismiss(pending), options.timeoutMs);
			}
			options.signal?.addEventListener("abort", pending.onAbort, { once: true });
			this.pending.set(question.id, pending);
			this.emit({
				t: "dialog",
				sessionId: this.sessionId(),
				request: this.frameQuestion(pending),
			});
			this.onChange();
		});

	/**
	 * Close a dialog nobody answered: its timeout fired, or the extension aborted the
	 * signal. The tab is told, so the dialog does not stay on screen waiting.
	 */
	private dismiss(pending: PendingDialog): void {
		if (this.pending.get(pending.question.id) !== pending) return;
		this.forget(pending);
		pending.resolve({ id: pending.question.id, method: "cancel" });
		this.emit({ t: "dialog-closed", sessionId: this.sessionId(), id: pending.question.id });
		this.onChange();
	}

	/** Drop what a pending question holds: its timer and its abort listener. */
	private forget(pending: PendingDialog): void {
		this.pending.delete(pending.question.id);
		if (pending.timer !== undefined) clearTimeout(pending.timer);
		if (pending.signal !== undefined && pending.onAbort !== undefined) {
			pending.signal.removeEventListener("abort", pending.onAbort);
		}
	}

	/** The question a tab receives, carrying the time it has left. */
	private frameQuestion(pending: PendingDialog): DialogQuestion {
		if (pending.deadline === undefined) return pending.question;
		const remaining = Math.max(0, pending.deadline - Date.now());
		return { ...pending.question, timeoutMs: remaining };
	}

	/**
	 * Answer one dialog. The first answer wins, and an answer only settles the
	 * kind of question it belongs to, so a stale tab cannot answer a confirm with
	 * a select value.
	 */
	answer(answer: DialogAnswer): AnswerOutcome {
		const pending = this.pending.get(answer.id);
		if (pending === undefined) return "stale";
		if (answer.method !== "cancel" && answer.method !== pending.question.method) return "mismatch";
		this.forget(pending);
		pending.resolve(answer);
		this.emit({ t: "dialog-closed", sessionId: this.sessionId(), id: answer.id });
		this.onChange();
		return "answered";
	}

	/** Close every dialog as cancelled. An abort must not leave one hanging. */
	cancelAll(): void {
		if (this.pending.size === 0) return;
		for (const pending of [...this.pending.values()]) {
			this.forget(pending);
			pending.resolve({ id: pending.question.id, method: "cancel" });
			this.emit({ t: "dialog-closed", sessionId: this.sessionId(), id: pending.question.id });
		}
		this.onChange();
	}

	/** Give a late subscriber the unanswered dialogs and the keyed display state. */
	replay(sink: FrameSink): void {
		for (const pending of this.pending.values()) {
			sink({ t: "dialog", sessionId: this.sessionId(), request: this.frameQuestion(pending) });
		}
		for (const request of this.displayState.values()) {
			sink({ t: "ui", sessionId: this.sessionId(), request });
		}
	}

	/** Forward a display-only request, remembering the keyed ones. */
	display = (request: ExtensionDisplay): void => {
		const key = displayKey(request);
		if (key !== undefined) {
			if (isCleared(request)) this.displayState.delete(key);
			else this.displayState.set(key, request);
		}
		this.emit({ t: "ui", sessionId: this.sessionId(), request });
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
