import { useEffect, useState } from "react";

import type { ModelOption, ThinkingLevel, ToolsView } from "#protocol/conversation/session";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import type { Conversation } from "./use-conversation.ts";

/**
 * The session's knobs in one dialog: the model, how hard it thinks, which tools it may
 * call, and pi's manual compaction.
 *
 * Every value is the engine's answer, not the page's guess: a switch is drawn from the
 * last `sessionMeta` frame and the engine broadcasts a new one after each command.
 */
export function SessionControls({
	conversation,
	onClose,
}: {
	conversation: Conversation;
	onClose: () => void;
}) {
	const { state } = conversation;
	const loadModels = conversation.models;
	const loadTools = conversation.tools;
	const [models, setModels] = useState<ReadonlyArray<ModelOption> | undefined>(undefined);
	const [tools, setTools] = useState<ToolsView | undefined>(undefined);
	const [filter, setFilter] = useState("");
	const [failure, setFailure] = useState<Error | undefined>(undefined);

	useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			try {
				const [nextModels, nextTools] = await Promise.all([loadModels(), loadTools()]);
				if (cancelled) return;
				setModels(nextModels);
				setTools(nextTools);
			} catch (cause) {
				if (cancelled) return;
				setFailure(cause instanceof Error ? cause : new Error(String(cause)));
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [loadModels, loadTools]);

	const run = async (action: Promise<void>): Promise<void> => {
		setFailure(undefined);
		try {
			await action;
		} catch (cause) {
			setFailure(cause instanceof Error ? cause : new Error(String(cause)));
		}
	};

	const needle = filter.trim().toLowerCase();
	const shown =
		models === undefined
			? undefined
			: needle === ""
				? models
				: models.filter((model) =>
						`${model.provider}/${model.id} ${model.name}`.toLowerCase().includes(needle),
					);

	const toggleTool = (name: string, active: boolean): void => {
		const next = active
			? state.activeTools.filter((each) => each !== name)
			: [...state.activeTools, name];
		void run(conversation.setTools(next));
	};

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Session</DialogTitle>
					<DialogDescription>
						pi&apos;s own settings for this chat. A change takes effect on the next turn.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<section className="grid gap-2">
						<h3 className="text-section">Model</h3>
						<p className="text-meta text-muted-foreground">
							{state.model ?? "No model selected yet."}
						</p>
						<Input
							aria-label="Filter models"
							autoComplete="off"
							placeholder="Filter models"
							value={filter}
							onChange={(event) => setFilter(event.target.value)}
						/>
						{shown === undefined ? (
							<LoadingState label="Reading pi's models…" />
						) : (
							<div className="grid max-h-56 gap-0.5 overflow-y-auto rounded-xl border p-1">
								{shown.length === 0 && (
									<p className="p-2 text-meta text-muted-foreground">No model matches.</p>
								)}
								{shown.map((model) => {
									const current = state.model === `${model.provider}/${model.id}`;
									return (
										<Button
											key={`${model.provider}/${model.id}`}
											aria-pressed={current}
											className="justify-start gap-2"
											size="sm"
											variant={current ? "secondary" : "ghost"}
											onClick={() => void run(conversation.setModel(model.provider, model.id))}
										>
											<span className="truncate">{model.name}</span>
											<span className="ml-auto truncate text-meta text-muted-foreground">
												{model.provider}/{model.id}
											</span>
										</Button>
									);
								})}
							</div>
						)}
					</section>

					<section className="grid gap-2">
						<h3 className="text-section">Thinking</h3>
						<div className="flex flex-wrap gap-1">
							{THINKING.map((level) => (
								<Button
									key={level}
									aria-pressed={state.thinking === level}
									size="sm"
									variant={state.thinking === level ? "secondary" : "outline"}
									onClick={() => void run(conversation.setThinking(level))}
								>
									{level}
								</Button>
							))}
						</div>
					</section>

					<section className="grid gap-2">
						<h3 className="text-section">Tools</h3>
						<p className="text-meta text-muted-foreground">
							The tools pi declares to the model. An unchecked tool stays registered and callable
							from other tools.
						</p>
						{tools === undefined ? (
							<LoadingState label="Reading the tools…" />
						) : (
							<div className="grid max-h-56 gap-0.5 overflow-y-auto rounded-xl border p-1">
								{tools.all.map((tool) => {
									const active = state.activeTools.includes(tool.name);
									return (
										<div
											key={tool.name}
											className="flex items-start gap-2 rounded-lg p-2 hover:bg-muted"
										>
											<input
												aria-label={`Use ${tool.name}`}
												checked={active}
												className="mt-1"
												type="checkbox"
												onChange={() => toggleTool(tool.name, active)}
											/>
											<span className="grid min-w-0 gap-0.5">
												<span className="flex items-center gap-2 text-body">
													<span className="truncate">{tool.name}</span>
													{!active && <Badge variant="outline">off</Badge>}
												</span>
												<span className="line-clamp-2 text-meta text-muted-foreground">
													{tool.description}
												</span>
											</span>
										</div>
									);
								})}
							</div>
						)}
					</section>

					{failure !== undefined && (
						<Notice tone="error" title="That did not take effect">
							{errorView(failure).line}
						</Notice>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => void run(conversation.compact())}>
						Compact this chat
					</Button>
					<Button onClick={onClose}>Done</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** pi's levels, in its own order; the engine validates the same list. */
const THINKING: ReadonlyArray<ThinkingLevel> = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];
