import { useNavigate } from "@tanstack/react-router";
import { ArrowUpIcon, PaperclipIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";

import { parseBuiltinCommand } from "#domain/conversation/commands";
import type { ConversationState } from "#domain/conversation/state";
import { PERMISSION_STATUS_KEY } from "#domain/permission/rules";
import type { PermissionMode } from "#domain/permission/rules";
import {
	PROMPT_IMAGE_BASE64_TOTAL_MAX,
	PROMPT_IMAGE_BYTES_MAX,
	PROMPT_IMAGE_MAX,
	promptImagesBase64Length,
} from "#protocol/conversation/commands";
import type { ExportedSession, ExportFormat } from "#protocol/conversation/export";
import type { ImageBlock } from "#protocol/conversation/frames";
import type { AutocompleteReply, CommandOffer } from "#protocol/conversation/palette";
import type { ModelOption, ThinkingLevel } from "#protocol/conversation/session";
import type { ContextView } from "#protocol/settings/context";
import { shortcut } from "@/components/patterns/shortcut";
import { errorView } from "@/components/patterns/status/error-view";
import { Notice } from "@/components/patterns/status/notice";
import type { Tone } from "@/components/patterns/status/status-tone";
import { Tip } from "@/components/patterns/tip";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group";

import { AttachmentStrip } from "./composer/attachments";
import type { Attachment } from "./composer/attachments";
import { runComposerCommand } from "./composer/builtin-commands";
import type { ComposerCommandContext, RouteTarget } from "./composer/builtin-commands";
import { CacheWarmingState } from "./composer/cache-warming";
import { ContextMeter } from "./composer/context-meter";
import { ModelMenu } from "./composer/model-menu";
import { Palette } from "./composer/palette";
import type { PaletteEntry } from "./composer/palette";
import { PermissionMenu } from "./composer/permission-menu";
import { ThinkingMenu } from "./composer/thinking-menu";
import { ToolsMenu } from "./composer/tools-menu";
import { takeHandedOffDraft } from "./draft.ts";

/** How a message joins a run that is already going; an idle composer ignores it. */
type Behavior = "steer" | "followUp";

/**
 * What follows `/` while the draft is still a bare command. A space ends it: from then on
 * the text is an argument to the command that was picked.
 */
const commandQuery = (draft: string): string | undefined => {
	const trimmed = draft.trimStart();
	if (!trimmed.startsWith("/")) return undefined;
	const query = trimmed.slice(1);
	return query.includes(" ") ? undefined : query;
};

/**
 * How long the composer waits after a keystroke before asking an extension's autocomplete
 * providers, so typing does not send a query per key.
 */
const SUGGESTION_DELAY_MS = 150;

/** A megabyte as a file size reads it, for the caps the protocol states in bytes. */
const MEGABYTE = 1024 * 1024;

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

/** A file the user picked, read the way the prompt command carries it. */
const readAttachment = async (file: File): Promise<Attachment | undefined> => {
	try {
		return {
			data: base64Of(new Uint8Array(await file.arrayBuffer())),
			mimeType: file.type,
			name: file.name,
		};
	} catch {
		return undefined;
	}
};

/**
 * The one input of a chat.
 *
 * Enter sends and Shift+Enter adds a line, which is the habit a chat box trains. While a
 * run is going, Enter steers it and Ctrl/⌘+Enter waits for it to settle, as pi's editor
 * does. A draft that starts with `!` is a shell command, and `!!` keeps its output out of
 * the model's context. A refused command is shown here in the feature's words instead of
 * disappearing; a chat whose file changed outside Epsilon is read-only.
 */
export function Composer({
	onSend,
	onBash,
	onAbort,
	onSetModel,
	onSetThinking,
	onSetCodingTools,
	busy,
	draft,
	state,
	sessionId,
	writable,
	models,
	model,
	thinking,
	thinkingLevels,
	codingTools,
	commands,
	header,
	onExport,
	onOpenFork,
	onOpenTree,
	onReadContext,
	onSetPermission,
	onSuggest,
}: {
	onSend: (text: string, behavior?: Behavior, images?: ReadonlyArray<ImageBlock>) => Promise<void>;
	/** Run a shell command; `excludeFromContext` is pi's `!!`. */
	onBash: (text: string, excludeFromContext: boolean) => Promise<void>;
	onAbort: () => Promise<void>;
	onSetModel: (provider: string, modelId: string) => void;
	onSetThinking: (level: ThinkingLevel) => void;
	onSetCodingTools: (enabled: boolean) => void;
	busy: boolean;
	/** Text pi put back, such as the message a tree move undid. */
	draft: { readonly text: string; readonly nonce: string } | undefined;
	/** The chat this box writes to, so a fork's text follows its new file. */
	sessionId: string;
	writable: boolean;
	models: ReadonlyArray<ModelOption>;
	model: ModelOption | undefined;
	thinking: ThinkingLevel | undefined;
	thinkingLevels: ReadonlyArray<ThinkingLevel>;
	codingTools: boolean;
	/** What `/` offers: the built-in table, pi's commands, templates and skills. */
	commands: ReadonlyArray<CommandOffer>;
	/** Drawn above the box, inside its column: where this conversation runs. */
	header: ReactNode;

	/** What the chat reads for its notices, `/copy` and `/session`. */
	state: ConversationState;
	onOpenTree: () => void;
	/** Open the fork dialog from `/fork`. */
	onOpenFork: () => void;
	onReadContext: () => Promise<ContextView>;
	/** pi's own exporter, through the engine that owns the session. */
	onExport: (format: ExportFormat) => Promise<ExportedSession>;
	/** The bundled permission extension's mode, through its own `/permission` command. */
	onSetPermission: (mode: PermissionMode) => void;
	/** An extension's providers answer what the draft suggests at the caret. */
	onSuggest: (text: string, cursor: number) => Promise<AutocompleteReply>;
}) {
	// A fork's text belongs to the new chat; this composer only takes it under that id.
	const [text, setText] = useState(() => takeHandedOffDraft(sessionId) ?? "");
	const [handedTo, setHandedTo] = useState(sessionId);
	// A fork's text belongs to the new chat; the route reaches it one render later.
	if (handedTo !== sessionId) {
		setHandedTo(sessionId);
		const handed = takeHandedOffDraft(sessionId);
		if (handed !== undefined) {
			setText((current) => (current === "" ? handed : `${handed}\n\n${current}`));
		}
	}
	const [failure, setFailure] = useState<Error | undefined>(undefined);
	// A refused attachment is a warning; a command's answer is information. One row, two
	// tones, so the icon matches what the line says.
	const [notice, setNotice] = useState<{ readonly text: string; readonly tone: Tone } | undefined>(
		undefined,
	);
	const [sending, setSending] = useState(false);
	const [modelMenuOpen, setModelMenuOpen] = useState(false);
	const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const [selected, setSelected] = useState<string>();
	const [dismissed, setDismissed] = useState<string>();
	const [suggestions, setSuggestions] = useState<AutocompleteReply | undefined>(undefined);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const surfaceRef = useRef<HTMLDivElement>(null);
	const applied = useRef<string | undefined>(undefined);
	const navigate = useNavigate();

	// pi's own editor puts a restored message in front of what is already typed.
	useEffect(() => {
		if (draft === undefined || applied.current === draft.nonce) return;
		applied.current = draft.nonce;
		setText((current) => (current === "" ? draft.text : `${draft.text}\n\n${current}`));
	}, [draft]);

	// An extension's providers see the draft after a pause, with the caret, the way its
	// `getEditorText` sees it. An empty draft asks nothing.
	useEffect(() => {
		const timer =
			text.trim() === ""
				? undefined
				: setTimeout(() => {
						const cursor = textareaRef.current?.selectionStart ?? text.length;
						void onSuggest(text, cursor).then(setSuggestions, () => setSuggestions(undefined));
					}, SUGGESTION_DELAY_MS);
		return () => {
			if (timer !== undefined) clearTimeout(timer);
		};
	}, [text, onSuggest]);

	const query = commandQuery(text);
	const commandMatches =
		query === undefined
			? []
			: commands.filter((command) => command.name.toLowerCase().includes(query.toLowerCase()));
	// A reply names the draft it answered, so one that arrived after the operator typed
	// on is not drawn.
	const answered = suggestions?.text === text ? suggestions : undefined;
	const entries: PaletteEntry[] = [
		...commandMatches.map<PaletteEntry>((command) => ({
			kind: "command",
			key: `command:${command.name}`,
			command,
		})),
		...(answered?.items ?? []).map<PaletteEntry>((item) => ({
			kind: "suggestion",
			key: `suggestion:${item.value}`,
			item,
			prefix: answered?.prefix ?? "",
		})),
	];
	const paletteOpen = entries.length > 0 && dismissed !== text;
	const highlighted = Math.max(
		0,
		entries.findIndex((entry) => entry.key === selected),
	);

	const pick = (entry: PaletteEntry) => {
		if (entry.kind === "command") {
			// pi expands its own `/name` when a prompt carries it, and answers Epsilon's own
			// before a prompt exists, so the palette fills the draft for Enter either way.
			setText(`/${entry.command.name} `);
			setSelected(entry.key);
			textareaRef.current?.focus();
			return;
		}
		// An extension's suggestion replaces the prefix its provider matched, the way pi
		// applies one; when the draft moved on, it lands at the caret instead.
		const area = textareaRef.current;
		const caret = area?.selectionStart ?? text.length;
		const start =
			entry.prefix !== "" && text.slice(0, caret).endsWith(entry.prefix)
				? caret - entry.prefix.length
				: caret;
		const next = text.slice(0, start) + entry.item.value + text.slice(caret);
		setText(next);
		setSelected(entry.key);
		setDismissed(next);
		requestAnimationFrame(() => {
			const at = start + entry.item.value.length;
			area?.setSelectionRange(at, at);
			area?.focus();
		});
	};

	const move = (step: number) => {
		if (entries.length === 0) return;
		const next = (highlighted + step + entries.length) % entries.length;
		setSelected(entries[next]?.key);
	};

	const empty = state.entries.length === 0 && state.streaming.length === 0;

	/** Where a route command goes: the settings shell and the chat list are pages. */
	const openRoute = (target: RouteTarget): void => {
		if (target === "chats") void navigate({ search: {}, to: "/" });
		else if (target === "providers") void navigate({ to: "/settings/providers" });
		else void navigate({ to: "/settings/general" });
	};

	/**
	 * What a browser-served command may touch. Rebuilt per command instead of memoized:
	 * a command is rare, and a stale handler would act on the previous render's state.
	 */
	const commandContext = (): ComposerCommandContext => ({
		empty,
		exportChat: onExport,
		models,
		navigate: openRoute,
		openModelMenu: () => setModelMenuOpen(true),
		openThinkingMenu: () => setThinkingMenuOpen(true),
		openFork: onOpenFork,
		openTree: onOpenTree,
		readContext: onReadContext,
		setModel: onSetModel,
		setThinking: onSetThinking,
		state,
		thinkingLevels,
	});

	/**
	 * A command in pi's built-in list. The browser acts here, or the engine runs pi's own
	 * session operation; a row that can do neither answers with its sentence. Either way
	 * the model never sees the text.
	 */
	const runCommand = async (
		command: NonNullable<ReturnType<typeof parseBuiltinCommand>>["command"],
		argument: string,
		message: string,
	): Promise<void> => {
		setText("");
		setAttachments([]);
		setNotice(undefined);
		setFailure(undefined);
		if (command.surface === "pi") {
			setSending(true);
			try {
				await onSend(message);
			} catch (cause) {
				setFailure(cause instanceof Error ? cause : new Error(String(cause)));
			} finally {
				setSending(false);
			}
			return;
		}
		try {
			const answer = await runComposerCommand(command, argument, commandContext());
			setNotice(answer === undefined ? undefined : { text: answer, tone: "info" });
		} catch (cause) {
			const view = errorView(cause instanceof Error ? cause : new Error(String(cause)));
			setNotice({ text: view.line, tone: view.tone });
		}
	};

	const submit = async (behavior?: Behavior): Promise<void> => {
		const message = text.trim();
		if (message === "" || !writable || sending) return;
		// `!cmd` runs in the shell, and `!!cmd` hides its output from the agent. A lone
		// `!` is not a command, so the draft stays instead of being sent.
		if (message.startsWith("!")) {
			const excludeFromContext = message.startsWith("!!");
			const command = message.slice(excludeFromContext ? 2 : 1).trim();
			if (command === "") return;
			if (attachments.length > 0) {
				setNotice({
					text: "A shell command takes no images: remove them, or send them in a message.",
					tone: "warning",
				});
				return;
			}
			setText("");
			setFailure(undefined);
			try {
				await onBash(command, excludeFromContext);
			} catch (cause) {
				setFailure(cause instanceof Error ? cause : new Error(String(cause)));
			}
			return;
		}
		// pi's built-in commands are the host's or this page's, never the model's: pi's
		// editor answers them in a terminal.
		const parsed = parseBuiltinCommand(message);
		if (parsed !== undefined) {
			if (attachments.length > 0) {
				setNotice({
					text: `/${parsed.command.name} takes no images: remove them, or send them in a message.`,
					tone: "warning",
				});
				return;
			}
			await runCommand(parsed.command, parsed.argument, message);
			return;
		}
		setSending(true);
		try {
			await onSend(
				message,
				behavior,
				attachments.length === 0
					? undefined
					: attachments.map(({ data, mimeType }) => ({ data, mimeType, type: "image" as const })),
			);
			setText("");
			setAttachments([]);
			setNotice(undefined);
			setFailure(undefined);
		} catch (cause) {
			setFailure(cause instanceof Error ? cause : new Error(String(cause)));
		} finally {
			setSending(false);
		}
	};

	/**
	 * Add picked, pasted or dropped files. The caps are the protocol's own, checked here
	 * so a file the user chose gets a reason instead of a refused command; pi resizes and
	 * rejects images itself, so nothing here reads their pixels.
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
		setNotice(problems.length === 0 ? undefined : { text: problems.join(" "), tone: "warning" });
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

	// Every keyed status an extension set, except the permission mode: the footer's menu
	// already draws that one, in the browser's words rather than the extension's.
	const rail = state.statuses.filter((status) => status.key !== PERMISSION_STATUS_KEY);

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (paletteOpen) {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				move(event.key === "ArrowDown" ? 1 : -1);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				const entry = entries[highlighted];
				if (entry !== undefined) {
					event.preventDefault();
					pick(entry);
					return;
				}
			}
			// Esc closes the list first; it stops the run only when nothing is open.
			if (event.key === "Escape") {
				event.preventDefault();
				setDismissed(text);
				return;
			}
		}
		if (event.key === "Escape" && busy) {
			event.preventDefault();
			void onAbort();
			return;
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			if (event.metaKey || event.ctrlKey) void submit("followUp");
			else void submit(busy ? "steer" : undefined);
		}
	};

	return (
		<div className="border-t p-3">
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
				{failure !== undefined && (
					<div className="pb-2">
						<Notice error={failure} title="The message was not sent" />
					</div>
				)}
				{notice !== undefined && (
					<div className="pb-2">
						<Notice tone={notice.tone}>{notice.text}</Notice>
					</div>
				)}
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void submit(busy ? "steer" : undefined);
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
							aria-label="Message"
							placeholder={
								writable
									? busy
										? `Steer this run: Enter steers, ${shortcut("Enter")} waits until it settles, Esc stops`
										: "Message the agent (/ commands, ! shell, Enter sends, paste or drop images)"
									: "This chat is read-only until it is reloaded."
							}
							value={text}
							rows={2}
							disabled={!writable}
							className="max-h-40 min-h-11 p-3"
							onChange={(event) => setText(event.target.value)}
							onKeyDown={onKeyDown}
							onPaste={(event) => {
								const files = [...event.clipboardData.files];
								if (files.length === 0) return;
								event.preventDefault();
								void attach(files);
							}}
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
								models={[...models]}
								model={model}
								open={modelMenuOpen}
								onOpenChange={setModelMenuOpen}
								onSelect={(next) => onSetModel(next.provider, next.id)}
							/>
							<ThinkingMenu
								level={thinking ?? "off"}
								levels={[...thinkingLevels]}
								open={thinkingMenuOpen}
								onOpenChange={setThinkingMenuOpen}
								onSelect={onSetThinking}
							/>
							<ToolsMenu codingTools={codingTools} onSelect={onSetCodingTools} />
							<PermissionMenu
								statuses={[...state.statuses]}
								onSelect={(mode) => onSetPermission(mode)}
							/>
							{busy && (
								<Tip label="Stop the run">
									<InputGroupButton
										size="icon-sm"
										variant="destructive"
										className="ml-auto rounded-full"
										aria-label="Stop the run"
										onClick={() => void onAbort()}
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
									className={busy ? "rounded-full" : "ml-auto rounded-full"}
									disabled={text.trim() === "" || !writable || sending}
									aria-label={busy ? "Steer the run" : "Send"}
								>
									<ArrowUpIcon />
								</InputGroupButton>
							</Tip>
						</InputGroupAddon>
					</InputGroup>
				</form>
				{state.readings !== undefined &&
					(state.readings.contextUsage !== undefined ||
						state.readings.cacheWarming !== undefined) && (
						<div className="flex items-start gap-2 px-1 pt-1">
							<div className="ml-auto flex shrink-0 items-center gap-2">
								<CacheWarmingState status={state.readings.cacheWarming} />
								<ContextMeter usage={state.readings.contextUsage} stats={state.readings.stats} />
							</div>
						</div>
					)}
				<Palette
					open={paletteOpen}
					anchor={surfaceRef}
					entries={entries}
					selected={entries[highlighted]?.key}
					onSelect={setSelected}
					onPick={pick}
					onDismiss={() => setDismissed(text)}
				/>
			</div>
		</div>
	);
}
