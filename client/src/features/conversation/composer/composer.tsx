import { ArrowUpIcon, PaperclipIcon, SquareIcon } from "lucide-react";
import { memo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import {
	PROMPT_IMAGE_BASE64_TOTAL_MAX,
	PROMPT_IMAGE_BYTES_MAX,
	PROMPT_IMAGE_MAX,
	promptImagesBase64Length,
} from "shared";
import type {
	ContextUsage,
	PromptBehavior,
	SnapshotBranch,
	SnapshotCommand,
	SnapshotModel,
	ThinkingLevel,
	UiStatus,
} from "shared";

import { shortcut } from "@/components/patterns/shortcut";
import { Tip } from "@/components/patterns/tip";
import type { ConversationStore } from "@/features/conversation/store";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group";
import type { Attachment } from "./attachments";
import { AttachmentStrip } from "./attachments";
import { BranchMenu } from "./branch-menu";
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
	/** pi is replacing the transcript, so a move in the tree is refused as well. */
	isCompacting: boolean;
	/** The active branch's user messages, which going back can reach. */
	branches: SnapshotBranch[];
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
	/** Drawn under the box, inside its column: where this conversation runs. */
	footer?: ReactNode;
	/** A draft was sent, so the page can make this session its URL. */
	onSent?: () => void;
};

function ComposerImpl({
	store,
	busy,
	isCompacting,
	branches,
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
	footer,
	onSent,
}: ComposerProps) {
	const [draft, setDraft] = useState("");
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
		// pi expands `/name` through its extension runner and prompt templates when a
		// prompt carries it, so the palette fills the draft and the next Enter runs it.
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
		// A reload is a socket command, not a prompt: pi would hand `/reload` to the
		// model. It works while a run streams because it does not touch the run.
		if (message === "/reload") {
			if (attachments.length > 0) {
				setNotice("Reload takes no images: remove them, or send them in a message.");
				return;
			}
			store.reload();
		} else {
			store.prompt(
				message,
				busy ? (behavior ?? "steer") : undefined,
				attachments.length === 0
					? undefined
					: attachments.map(({ mimeType, data }) => ({ mimeType, data })),
			);
			onSent?.();
		}
		setDraft("");
		setAttachments([]);
		setNotice(undefined);
	};

	/**
	 * Go back to an earlier message of this branch. The text goes into the box first,
	 * so it is ready whether or not the engine accepted the move; sending it then
	 * starts a new branch in place of what followed the message.
	 */
	const goBack = (branch: SnapshotBranch) => {
		setDraft(branch.text);
		store.navigateTree(branch.entryId);
	};

	/** pi refuses a move while the tree is busy, so the control says why instead. */
	const goBackBlocked = busy
		? "Wait for the run to finish: pi refuses to move the tree while it streams"
		: isCompacting
			? "Wait for the compaction to finish: pi refuses to move the tree while it compacts"
			: undefined;

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

	return (
		<div className={inline ? undefined : "border-t p-3"}>
			<div ref={surfaceRef} className="mx-auto w-full max-w-3xl">
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
							autoFocus={inline}
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
							<Tip
								label={`Attach an image from a file, a paste or a drop. Up to ${PROMPT_IMAGE_MAX}, ${IMAGE_MEGABYTES} MB each.`}
							>
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
								onSelect={(next) => store.setModel(next.provider, next.id)}
							/>
							<ContextMeter usage={contextUsage} cost={cost} />
							<ThinkingMenu
								level={thinkingLevel}
								levels={availableThinkingLevels}
								onSelect={(level) => store.setThinkingLevel(level)}
							/>
							<ToolsMenu
								codingTools={codingTools}
								onSelect={(enabled) => store.setCodingTools(enabled)}
							/>
							<PermissionMenu statuses={statuses} onSelect={(mode) => store.setPermission(mode)} />
							<BranchMenu branches={branches} blocked={goBackBlocked} onGoBack={goBack} />
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
							<Tip label={busy ? `Steer the run. ${shortcut("Enter")} sends a follow-up.` : "Send"}>
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
				{notice !== undefined && (
					<p role="status" className="px-1 pt-1 text-meta text-muted-foreground">
						{notice}
					</p>
				)}
				{footer}
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
