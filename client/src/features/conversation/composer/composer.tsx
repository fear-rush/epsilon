import { ArrowUpIcon, PaperclipIcon, SquareIcon } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
	PERMISSION_STATUS_KEY,
	PROMPT_IMAGE_BASE64_TOTAL_MAX,
	PROMPT_IMAGE_BYTES_MAX,
	PROMPT_IMAGE_MAX,
	parseBuiltinCommand,
	promptImagesBase64Length,
} from "shared";
import type {
	ContextUsage,
	EditorRequest,
	ParsedBuiltinCommand,
	PromptBehavior,
	SnapshotCommand,
	SnapshotModel,
	SnapshotTreeNode,
	ThinkingLevel,
	UiStatus,
} from "shared";

import { shortcut } from "@/components/patterns/shortcut";
import { Tip } from "@/components/patterns/tip";
import { clearPendingDraft, pendingDraftOf } from "@/features/conversation/pending-draft";
import type { ConversationStore } from "@/features/conversation/store";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group";
import type { Attachment } from "./attachments";
import { AttachmentStrip } from "./attachments";
import type { ComposerCommandContext, RouteTarget } from "./builtin-commands";
import { runComposerCommand } from "./builtin-commands";
import { ContextMeter } from "./context-meter";
import { ModelMenu } from "./model-menu";
import { Palette } from "./palette";
import { PermissionMenu } from "./permission-menu";
import { ThinkingMenu } from "./thinking-menu";
import { ToolsMenu } from "./tools-menu";

/**
 * The composer: the draft, the `/` palette, `!cmd`, and the footer controls. It
 * owns the arrow keys and Enter, because focus never leaves the textarea, so the
 * palette and the run controls are driven from one key handler instead of three.
 */

/**
 * What follows `/` while the draft is still a bare command. A space ends it: from
 * then on the text is an argument to the command that was picked.
 */
const commandQuery = (draft: string): string | undefined => {
	const trimmed = draft.trimStart();
	if (!trimmed.startsWith("/")) return undefined;
	const query = trimmed.slice(1);
	return query.includes(" ") ? undefined : query;
};

/** A megabyte as a file size reads it, for the caps the protocol states in bytes. */
const MEGABYTE = 1024 * 1024;

/**
 * How long the composer waits after a keystroke before reporting its draft, so an
 * extension's `getEditorText` reads what was typed without a frame per key.
 */
const EDITOR_REPORT_DELAY_MS = 120;

/** What one image may hold, in the words of the message that refuses it. */
const IMAGE_MEGABYTES = PROMPT_IMAGE_BYTES_MAX / MEGABYTE;

/** The whole prompt's images, as the message that refuses them writes it. */
const IMAGE_TOTAL_CHARACTERS = PROMPT_IMAGE_BASE64_TOTAL_MAX.toLocaleString();

/**
 * Base64 for a file's bytes. One `String.fromCharCode` call over 2 MB of arguments
 * overflows the stack, so the binary string is built a chunk at a time.
 */
const base64Of = (bytes: Uint8Array): string => {
	const CHUNK = 0x8000;
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
	}
	return btoa(binary);
};

/** A file the user picked, read the way the prompt frame carries it. */
const readAttachment = async (file: File): Promise<Attachment | undefined> => {
	try {
		return {
			name: file.name,
			mimeType: file.type,
			data: base64Of(new Uint8Array(await file.arrayBuffer())),
		};
	} catch {
		return undefined;
	}
};

type ComposerProps = {
	store: ConversationStore;
	busy: boolean;
	/** The session tree, so `/tree` knows whether there is anything to show. */
	tree: SnapshotTreeNode[];
	/** A chat with no message has nothing to fork, clone or move to yet. */
	empty: boolean;
	/** Why pi refuses a branch action right now; undefined when it is possible. */
	blocked: string | undefined;
	/** pi refuses a prompt while it replaces the transcript with a summary. */
	isCompacting: boolean;
	/** Open the page's tree dialog, fork dialog and clone action. */
	onTree?: () => void;
	onFork?: () => void;
	onClone?: () => void;
	models: SnapshotModel[];
	model: SnapshotModel | undefined;
	thinkingLevel: ThinkingLevel;
	availableThinkingLevels: ThinkingLevel[];
	statuses: UiStatus[];
	commands: SnapshotCommand[];
	codingTools: boolean;
	/** Absent while pi cannot read the context; the meter then shows nothing. */
	contextUsage: ContextUsage | undefined;
	/** What the session has spent, for the meter's Tip. */
	cost: number;
	/** An empty session draws the box in the page, not docked under a transcript. */
	inline?: boolean;
	/** Drawn above the box, inside its column: where this conversation runs. */
	header?: ReactNode;
	/** A draft was sent, so the page can make this session its URL. */
	onSent?: () => void;
	/** Prompts an abort or a Clear took back from pi, for the draft. */
	restoreDraft: string | undefined;
	/** A draft an extension wrote: `setEditorText` replaces it, its paste appends. */
	editorRequest: EditorRequest | undefined;
};

function ComposerImpl({
	store,
	busy,
	tree,
	empty,
	blocked,
	isCompacting,
	onTree,
	onFork,
	onClone,
	models,
	model,
	thinkingLevel,
	availableThinkingLevels,
	statuses,
	commands,
	codingTools,
	contextUsage,
	cost,
	inline = false,
	header,
	onSent,
	restoreDraft,
	editorRequest,
}: ComposerProps) {
	const [draft, setDraft] = useState(() => pendingDraftOf(store.sessionId));
	/** The highlighted command, and the draft it was dismissed at. */
	const [selected, setSelected] = useState<string>();
	const [dismissed, setDismissed] = useState<string>();
	const formRef = useRef<HTMLFormElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const surfaceRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	/** The images the next prompt carries, and why the last attach was refused. */
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const [notice, setNotice] = useState<string>();
	/** `/model` and `/thinking` with no argument open the menus the footer holds. */
	const [modelMenuOpen, setModelMenuOpen] = useState(false);
	const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
	const navigate = useNavigate();

	// The fork put its message here before navigating; this composer is the reader.
	useEffect(() => {
		clearPendingDraft(store.sessionId);
	}, [store.sessionId]);

	/** Set once a restored queue has been appended, so a re-render cannot add it twice. */
	const restoredRef = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (restoreDraft === undefined || restoredRef.current === restoreDraft) return;
		restoredRef.current = restoreDraft;
		setDraft((current) =>
			[restoreDraft, current].filter((text) => text.trim() !== "").join("\n\n"),
		);
		store.clearRestoreDraft();
	}, [restoreDraft, store]);

	// An extension's `getEditorText` reads this from the server, so the draft is
	// reported after each pause rather than on every keystroke.
	useEffect(() => {
		const timer = setTimeout(() => store.reportEditor(draft), EDITOR_REPORT_DELAY_MS);
		return () => clearTimeout(timer);
	}, [draft, store]);

	/** Set once an extension's write has been taken, so a second pass cannot apply it. */
	const takenRef = useRef<EditorRequest | undefined>(undefined);
	useEffect(() => {
		if (editorRequest === undefined || takenRef.current === editorRequest) return;
		takenRef.current = editorRequest;
		setDraft((current) =>
			editorRequest.mode === "append" ? current + editorRequest.text : editorRequest.text,
		);
		store.dismissEditorRequest();
	}, [editorRequest, store]);

	const query = commandQuery(draft);
	const matches =
		query === undefined
			? []
			: commands.filter((command) => command.name.toLowerCase().includes(query.toLowerCase()));
	const paletteOpen = query !== undefined && matches.length > 0 && dismissed !== draft;
	const highlighted = Math.max(
		0,
		matches.findIndex((command) => command.name === selected),
	);

	const pick = (name: string) => {
		// pi expands its own `/name` when a prompt carries it, and answers Epsilon's
		// own before a prompt exists, so the palette fills the draft for Enter either way.
		setDraft(`/${name} `);
		setSelected(name);
		textareaRef.current?.focus();
	};

	const move = (step: number) => {
		if (matches.length === 0) return;
		const next = (highlighted + step + matches.length) % matches.length;
		setSelected(matches[next]?.name);
	};

	/**
	 * Add picked, pasted or dropped files. The caps are the protocol's own
	 * (`shared/src/protocol/frames.ts`), checked here so a file the user chose gets a
	 * reason instead of a refused frame; pi resizes and rejects images itself, so
	 * nothing here reads their pixels.
	 */
	const attach = async (files: File[]) => {
		const images = files.filter((file) => file.type.startsWith("image/"));
		const problems: string[] = [];
		if (images.length < files.length) problems.push("Only images can be attached.");
		const room = Math.max(0, PROMPT_IMAGE_MAX - attachments.length);
		const withinCount = images.slice(0, room);
		if (withinCount.length < images.length) {
			problems.push(`A message carries at most ${PROMPT_IMAGE_MAX} images.`);
		}
		const sized = withinCount.filter((file) => file.size <= PROMPT_IMAGE_BYTES_MAX);
		const oversized = withinCount.length - sized.length;
		if (oversized > 0) {
			const subject = oversized === 1 ? "One image is" : `${oversized} images are`;
			problems.push(`${subject} over the ${IMAGE_MEGABYTES} MB limit for one image.`);
		}
		const read = await Promise.all(sized.map(readAttachment));
		const loaded = read.filter((attachment): attachment is Attachment => attachment !== undefined);
		if (loaded.length < read.length) problems.push("An image could not be read.");
		let total = promptImagesBase64Length(attachments);
		const admitted: Attachment[] = [];
		for (const attachment of loaded) {
			if (total + attachment.data.length > PROMPT_IMAGE_BASE64_TOTAL_MAX) {
				problems.push(`Images together are over the ${IMAGE_TOTAL_CHARACTERS} character limit.`);
				break;
			}
			total += attachment.data.length;
			admitted.push(attachment);
		}
		if (admitted.length > 0) {
			// The caps were read from this render's list; a second attach that landed
			// before it re-rendered must not get past the count.
			setAttachments((previous) => [...previous, ...admitted].slice(0, PROMPT_IMAGE_MAX));
		}
		setNotice(problems.length === 0 ? undefined : problems.join(" "));
	};

	const pickFiles = (event: ChangeEvent<HTMLInputElement>) => {
		const files = [...(event.target.files ?? [])];
		// An emptied value lets the same file be picked again after it was removed.
		event.target.value = "";
		void attach(files);
	};

	const removeAttachment = (index: number) => {
		setAttachments((previous) => previous.filter((_attachment, at) => at !== index));
		setNotice(undefined);
	};

	/** Where a route command goes: the settings shell and the chat list are pages. */
	const openRoute = (target: RouteTarget): void => {
		if (target === "chats") void navigate({ to: "/", search: {} });
		else if (target === "providers") void navigate({ to: "/settings/providers" });
		else void navigate({ to: "/settings/general" });
	};

	/**
	 * What a browser-served command may touch. Rebuilt per command instead of memoized:
	 * a command is rare, and a stale handler would act on the previous render's state.
	 */
	const composerCommandContext = (): ComposerCommandContext => ({
		store,
		models,
		tree,
		thinkingLevels: availableThinkingLevels,
		empty,
		blocked,
		openTree: onTree,
		openFork: onFork,
		clone: onClone,
		openModelMenu: () => setModelMenuOpen(true),
		openThinkingMenu: () => setThinkingMenuOpen(true),
		navigate: openRoute,
	});

	/**
	 * A command in pi's built-in list. The browser acts here, or the host runs pi's own
	 * session operation on the engine; a row that can do neither answers with its
	 * sentence. Either way the model never sees the text.
	 */
	const runCommand = async ({ command, argument }: ParsedBuiltinCommand, text: string) => {
		if (command.surface === "pi") {
			store.prompt(text);
			return;
		}
		try {
			setNotice(await runComposerCommand(command, argument, composerCommandContext()));
		} catch (cause) {
			setNotice(cause instanceof Error ? cause.message : String(cause));
		}
	};

	/**
	 * Send the draft. `behavior` joins a run that is already going: Enter steers,
	 * Ctrl/⌘+Enter waits for the run to settle. An idle composer ignores it.
	 */
	const submit = (behavior?: PromptBehavior) => {
		const message = draft.trim();
		if (message === "") return;
		// `!cmd` runs in the shell, and `!!cmd` hides its output from the agent. A
		// lone `!` is not a command, so the draft stays instead of being sent.
		if (message.startsWith("!")) {
			const excludeFromContext = message.startsWith("!!");
			const command = message.slice(excludeFromContext ? 2 : 1).trim();
			if (command === "") return;
			if (attachments.length > 0) {
				setNotice("A shell command takes no images: remove them, or send them in a message.");
				return;
			}
			store.runBash(command, excludeFromContext);
			onSent?.();
			setDraft("");
			return;
		}
		// `/tree`, `/compact` and the rest of pi's built-in commands are the host's or
		// this page's, never the model's: pi's editor answers them in a terminal.
		const parsed = parseBuiltinCommand(message);
		if (parsed !== undefined) {
			if (attachments.length > 0) {
				setNotice(
					`/${parsed.command.name} takes no images: remove them, or send them in a message.`,
				);
				return;
			}
			setDraft("");
			setAttachments([]);
			setNotice(undefined);
			void runCommand(parsed, message);
			return;
		}
		// pi refuses a prompt while compaction is in progress ("Cannot submit a prompt
		// while compaction is in progress"), and its refusal arrives after the draft
		// would already be gone. The text stays where the user typed it.
		if (isCompacting) {
			setNotice("pi refuses a prompt while it compacts. Your draft stays here until it finishes.");
			return;
		}
		store.prompt(
			message,
			busy ? (behavior ?? "steer") : undefined,
			attachments.length === 0
				? undefined
				: attachments.map(({ mimeType, data }) => ({ mimeType, data })),
		);
		onSent?.();
		setDraft("");
		setAttachments([]);
		setNotice(undefined);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (paletteOpen) {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				move(event.key === "ArrowDown" ? 1 : -1);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				const match = matches[highlighted];
				if (match !== undefined) {
					event.preventDefault();
					pick(match.name);
					return;
				}
			}
			// Esc closes the list first; it stops the run only when nothing is open.
			if (event.key === "Escape") {
				event.preventDefault();
				setDismissed(draft);
				return;
			}
		}
		if (event.key === "Escape" && busy) {
			event.preventDefault();
			store.abort();
			return;
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			if (event.metaKey || event.ctrlKey) submit("followUp");
			else formRef.current?.requestSubmit();
		}
	};

	// Every keyed status an extension set, except the permission mode: the footer's
	// menu already draws that one, in the browser's words rather than the extension's.
	const rail = statuses.filter((status) => status.key !== PERMISSION_STATUS_KEY);

	return (
		<div className={inline ? undefined : "border-t p-3"}>
			<div ref={surfaceRef} className="mx-auto w-full max-w-4xl">
				{header !== undefined && <div className="min-w-0 pb-2">{header}</div>}
				{rail.length > 0 && (
					<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 pb-1 text-meta text-muted-foreground">
						{rail.map((status) => (
							<span key={status.key} data-status-key={status.key} className="min-w-0 truncate">
								{status.text}
							</span>
						))}
					</div>
				)}
				<form
					ref={formRef}
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
					onDragOver={(event) => {
						// Only a drag that carries files is an attachment; text keeps its own drop.
						if (event.dataTransfer.types.includes("Files")) event.preventDefault();
					}}
					onDrop={(event) => {
						const files = [...event.dataTransfer.files];
						if (files.length === 0) return;
						event.preventDefault();
						void attach(files);
					}}
				>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						multiple
						className="hidden"
						onChange={pickFiles}
					/>
					<InputGroup className="border-foreground/25">
						{attachments.length > 0 && (
							<InputGroupAddon align="block-start">
								<AttachmentStrip attachments={attachments} onRemove={removeAttachment} />
							</InputGroupAddon>
						)}
						<InputGroupTextarea
							ref={textareaRef}
							// An empty chat is opened to be typed in, so the caret starts here.
							autoFocus={inline || draft !== ""}
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={onKeyDown}
							onPaste={(event) => {
								const files = [...event.clipboardData.files];
								if (files.length === 0) return;
								event.preventDefault();
								void attach(files);
							}}
							placeholder={
								busy
									? `Steer this run: Enter steers, ${shortcut("Enter")} waits until it settles, Esc stops`
									: "Message the agent (/ commands, ! shell, Enter sends, paste or drop images)"
							}
							className="max-h-40 min-h-11 p-3"
						/>
						<InputGroupAddon align="block-end">
							<Tip label="Attach images">
								<InputGroupButton
									size="icon-sm"
									aria-label="Attach images"
									onClick={() => fileInputRef.current?.click()}
								>
									<PaperclipIcon />
								</InputGroupButton>
							</Tip>
							<ModelMenu
								models={models}
								model={model}
								open={modelMenuOpen}
								onOpenChange={setModelMenuOpen}
								onSelect={(next) => store.setModel(next.provider, next.id)}
							/>
							<ThinkingMenu
								level={thinkingLevel}
								levels={availableThinkingLevels}
								open={thinkingMenuOpen}
								onOpenChange={setThinkingMenuOpen}
								onSelect={(level) => store.setThinkingLevel(level)}
							/>
							<ToolsMenu
								codingTools={codingTools}
								onSelect={(enabled) => store.setCodingTools(enabled)}
							/>
							<PermissionMenu statuses={statuses} onSelect={(mode) => store.setPermission(mode)} />
							{busy && (
								<Tip label="Stop the run">
									<InputGroupButton
										size="icon-sm"
										variant="destructive"
										className="rounded-full"
										aria-label="Stop the run"
										onClick={() => store.abort()}
									>
										<SquareIcon />
									</InputGroupButton>
								</Tip>
							)}
							<Tip label={busy ? "Steer the run" : "Send"}>
								<InputGroupButton
									type="submit"
									size="icon-sm"
									variant="default"
									className="rounded-full"
									disabled={draft.trim() === ""}
									aria-label={busy ? "Steer the run" : "Send"}
								>
									<ArrowUpIcon />
								</InputGroupButton>
							</Tip>
						</InputGroupAddon>
					</InputGroup>
				</form>
				{(notice !== undefined || contextUsage !== undefined) && (
					<div className="flex items-start gap-2 px-1 pt-1">
						{notice !== undefined && (
							<p role="status" className="min-w-0 flex-1 text-meta text-muted-foreground">
								{notice}
							</p>
						)}
						<div className="ml-auto shrink-0">
							<ContextMeter usage={contextUsage} cost={cost} />
						</div>
					</div>
				)}
				<Palette
					open={paletteOpen}
					anchor={surfaceRef}
					commands={matches}
					selected={matches[highlighted]?.name}
					onSelect={setSelected}
					onPick={pick}
					onDismiss={() => setDismissed(draft)}
				/>
			</div>
		</div>
	);
}

/** The composer's props are stable during a stream, so a token does not redraw its menus. */
export const Composer = memo(ComposerImpl);
