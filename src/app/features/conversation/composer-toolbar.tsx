import { ArrowUpIcon, CircleHelpIcon, PaperclipIcon, SquareIcon } from "lucide-react";
import type { RefObject } from "react";

import type { ConversationState } from "#domain/conversation/state";
import type { PermissionMode } from "#domain/permission/rules";
import type { ModelOption, ThinkingLevel } from "#protocol/conversation/session";
import { Tip } from "@/components/patterns/tip";
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group";

import { ModelMenu } from "./composer/model-menu";
import { PermissionMenu } from "./composer/permission-menu";
import { ThinkingMenu } from "./composer/thinking-menu";
import { ToolsMenu } from "./composer/tools-menu";

/** What the box understands beyond plain text; the placeholder stays short (VO-2). */
const COMPOSER_HINT = "/ for commands · ! for a shell command";

/** The row under the box: attach, hints, model and thinking, tools, permission, stop and send. */
export function ComposerToolbar({
	busy,
	codingTools,
	fileInputRef,
	model,
	modelMenuOpen,
	models,
	onAbort,
	onSetCodingTools,
	onSetModel,
	onSetPermission,
	onSetThinking,
	onModelMenuOpenChange,
	onThinkingMenuOpenChange,
	sendDisabled,
	statuses,
	thinking,
	thinkingLevels,
	thinkingMenuOpen,
}: {
	busy: boolean;
	codingTools: boolean;
	fileInputRef: RefObject<HTMLInputElement | null>;
	model: ModelOption | undefined;
	modelMenuOpen: boolean;
	models: ReadonlyArray<ModelOption>;
	onAbort: () => Promise<void>;
	onSetCodingTools: (enabled: boolean) => void;
	onSetModel: (provider: string, modelId: string) => void;
	onSetPermission: (mode: PermissionMode) => void;
	onSetThinking: (level: ThinkingLevel) => void;
	onModelMenuOpenChange: (open: boolean) => void;
	onThinkingMenuOpenChange: (open: boolean) => void;
	sendDisabled: boolean;
	statuses: ConversationState["statuses"];
	thinking: ThinkingLevel | undefined;
	thinkingLevels: ReadonlyArray<ThinkingLevel>;
	thinkingMenuOpen: boolean;
}) {
	return (
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
			<Tip label={COMPOSER_HINT}>
				<InputGroupButton type="button" size="icon-sm" aria-label={COMPOSER_HINT}>
					<CircleHelpIcon />
				</InputGroupButton>
			</Tip>
			<fieldset data-slot="model-selector" className="ml-auto flex min-w-0 items-center">
				<legend className="sr-only">Model and thinking</legend>
				<ModelMenu
					models={[...models]}
					model={model}
					open={modelMenuOpen}
					onOpenChange={onModelMenuOpenChange}
					onSelect={(next) => onSetModel(next.provider, next.id)}
				/>
				<ThinkingMenu
					level={thinking ?? "off"}
					levels={[...thinkingLevels]}
					open={thinkingMenuOpen}
					onOpenChange={onThinkingMenuOpenChange}
					onSelect={onSetThinking}
				/>
			</fieldset>
			<ToolsMenu codingTools={codingTools} onSelect={onSetCodingTools} />
			<PermissionMenu statuses={[...statuses]} onSelect={(mode) => onSetPermission(mode)} />
			{busy && (
				<Tip label="Stop the run">
					<InputGroupButton
						size="icon-sm"
						variant="destructive"
						className="rounded-pill"
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
					className="rounded-pill"
					disabled={sendDisabled}
					aria-label={busy ? "Steer the run" : "Send"}
				>
					<ArrowUpIcon />
				</InputGroupButton>
			</Tip>
		</InputGroupAddon>
	);
}
