import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import type { Readings } from "#domain/conversation/state";
import type { ModelOption, ThinkingLevel } from "#protocol/conversation/session";
import { Notice } from "@/components/patterns/status/notice";
import { Tip } from "@/components/patterns/tip";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group";

import { CacheWarmingState } from "./composer/cache-warming";
import { ContextMeter } from "./composer/context-meter";
import { ModelMenu } from "./composer/model-menu";
import { ThinkingMenu } from "./composer/thinking-menu";
import { ToolsMenu } from "./composer/tools-menu";
import { takeHandedOffDraft } from "./draft.ts";

/** How a message joins a run that is already going; an idle composer ignores it. */
type Behavior = "steer" | "followUp";

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
	onSend: (text: string, behavior?: Behavior) => Promise<void>;
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
	const [sending, setSending] = useState(false);
	const [modelMenuOpen, setModelMenuOpen] = useState(false);
	const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
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
				await onSend(message, behavior);
				setText("");
				setFailure(undefined);
			} catch (cause) {
				setFailure(cause instanceof Error ? cause : new Error(String(cause)));
			} finally {
				setSending(false);
			}
		},
		[text, writable, sending, onSend, onBash],
	);

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
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void submit(busy ? "steer" : undefined);
					}}
				>
					<InputGroup className="border-foreground/25">
						<InputGroupTextarea
							aria-label="Message"
							placeholder={
								writable
									? busy
										? "Steer this run: Enter steers, Shift+Enter adds a line, Esc stops"
										: "Message Epsilon… (! runs a shell command)"
									: "This chat is read-only until it is reloaded."
							}
							value={text}
							rows={2}
							disabled={!writable}
							className="max-h-40 min-h-11 p-3"
							onChange={(event) => setText(event.target.value)}
							onKeyDown={onKeyDown}
						/>
						<InputGroupAddon align="block-end">
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
