import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { memo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { SnapshotCommand, SnapshotModel, ThinkingLevel, UiStatus } from "shared";

import { Tip } from "@/components/patterns/tip";
import type { ConversationStore } from "@/features/conversation/store";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group";
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

type ComposerProps = {
	store: ConversationStore;
	busy: boolean;
	models: SnapshotModel[];
	model: SnapshotModel | undefined;
	thinkingLevel: ThinkingLevel;
	availableThinkingLevels: ThinkingLevel[];
	statuses: UiStatus[];
	commands: SnapshotCommand[];
	codingTools: boolean;
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
	models,
	model,
	thinkingLevel,
	availableThinkingLevels,
	statuses,
	commands,
	codingTools,
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

	const submit = () => {
		const message = draft.trim();
		if (message === "") return;
		// `!cmd` runs in the shell, and `!!cmd` hides its output from the agent. A
		// lone `!` is not a command, so the draft stays instead of being sent.
		if (message.startsWith("!")) {
			const excludeFromContext = message.startsWith("!!");
			const command = message.slice(excludeFromContext ? 2 : 1).trim();
			if (command === "") return;
			store.runBash(command, excludeFromContext);
			onSent?.();
			setDraft("");
			return;
		}
		// A reload is a socket command, not a prompt: pi would hand `/reload` to the
		// model. It works while a run streams because it does not touch the run.
		if (message === "/reload") {
			store.reload();
		} else {
			if (busy) store.steer(message);
			else store.sendPrompt(message);
			onSent?.();
		}
		setDraft("");
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
			formRef.current?.requestSubmit();
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
				>
					<InputGroup className="border-foreground/25">
						<InputGroupTextarea
							ref={textareaRef}
							// An empty chat is opened to be typed in, so the caret starts here.
							autoFocus={inline}
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={onKeyDown}
							placeholder={
								busy
									? "Steer the run (Enter steers, Esc stops)"
									: "Message the agent (/ commands, ! shell, Enter sends)"
							}
							className="max-h-40 min-h-11 p-3"
						/>
						<InputGroupAddon align="block-end">
							<ModelMenu
								models={models}
								model={model}
								onSelect={(next) => store.setModel(next.provider, next.id)}
							/>
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
							<Tip label={busy ? "Steer" : "Send"}>
								<InputGroupButton
									type="submit"
									size="icon-sm"
									variant="default"
									className="rounded-full"
									disabled={draft.trim() === ""}
									aria-label={busy ? "Steer" : "Send"}
								>
									<ArrowUpIcon />
								</InputGroupButton>
							</Tip>
						</InputGroupAddon>
					</InputGroup>
				</form>
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
