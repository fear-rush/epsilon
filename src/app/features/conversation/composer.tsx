import { ArrowUpIcon, PaperclipIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";

import type { Readings } from "#domain/conversation/state";
import {
	PROMPT_IMAGE_BASE64_TOTAL_MAX,
	PROMPT_IMAGE_BYTES_MAX,
	PROMPT_IMAGE_MAX,
	promptImagesBase64Length,
} from "#protocol/conversation/commands";
import type { ImageBlock } from "#protocol/conversation/frames";
import type { ModelOption, ThinkingLevel } from "#protocol/conversation/session";
import { Notice } from "@/components/patterns/status/notice";
import { Tip } from "@/components/patterns/tip";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group";

import { AttachmentStrip } from "./composer/attachments";
import type { Attachment } from "./composer/attachments";
import { CacheWarmingState } from "./composer/cache-warming";
import { ContextMeter } from "./composer/context-meter";
import { ModelMenu } from "./composer/model-menu";
import { ThinkingMenu } from "./composer/thinking-menu";
import { ToolsMenu } from "./composer/tools-menu";
import { takeHandedOffDraft } from "./draft.ts";

/** How a message joins a run that is already going; an idle composer ignores it. */
type Behavior = "steer" | "followUp";

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
	readings,
	sessionId,
	writable,
	models,
	model,
	thinking,
	thinkingLevels,
	codingTools,
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
	/** What pi reports under the box: the window, the session's totals and the cache warmer. */
	readings: Readings | undefined;
	/** The chat this box writes to, so a fork's text follows its new file. */
	sessionId: string;
	writable: boolean;
	models: ReadonlyArray<ModelOption>;
	model: ModelOption | undefined;
	thinking: ThinkingLevel | undefined;
	thinkingLevels: ReadonlyArray<ThinkingLevel>;
	codingTools: boolean;
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
	const [notice, setNotice] = useState<string | undefined>(undefined);
	const [sending, setSending] = useState(false);
	const [modelMenuOpen, setModelMenuOpen] = useState(false);
	const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const applied = useRef<string | undefined>(undefined);

	// pi's own editor puts a restored message in front of what is already typed.
	useEffect(() => {
		if (draft === undefined || applied.current === draft.nonce) return;
		applied.current = draft.nonce;
		setText((current) => (current === "" ? draft.text : `${draft.text}\n\n${current}`));
	}, [draft]);

	const submit = useCallback(
		async (behavior?: Behavior) => {
			const message = text.trim();
			if (message === "" || !writable || sending) return;
			// `!cmd` runs in the shell, and `!!cmd` hides its output from the agent. A lone
			// `!` is not a command, so the draft stays instead of being sent.
			if (message.startsWith("!")) {
				const excludeFromContext = message.startsWith("!!");
				const command = message.slice(excludeFromContext ? 2 : 1).trim();
				if (command === "") return;
				if (attachments.length > 0) {
					setNotice("A shell command takes no images: remove them, or send them in a message.");
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
		},
		[text, writable, sending, attachments, onSend, onBash],
	);

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

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
			<div className="mx-auto w-full max-w-4xl">
				{failure !== undefined && (
					<div className="pb-2">
						<Notice error={failure} title="The message was not sent" />
					</div>
				)}
				{notice !== undefined && (
					<div className="pb-2">
						<Notice tone="warning">{notice}</Notice>
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
							aria-label="Message"
							placeholder={
								writable
									? busy
										? "Steer this run: Enter steers, Shift+Enter adds a line, Esc stops"
										: "Message Epsilon… (! runs a shell command, paste or drop images)"
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
				{readings !== undefined &&
					(readings.contextUsage !== undefined || readings.cacheWarming !== undefined) && (
						<div className="flex items-start gap-2 px-1 pt-1">
							<div className="ml-auto flex shrink-0 items-center gap-2">
								<CacheWarmingState status={readings.cacheWarming} />
								<ContextMeter usage={readings.contextUsage} stats={readings.stats} />
							</div>
						</div>
					)}
			</div>
		</div>
	);
}
