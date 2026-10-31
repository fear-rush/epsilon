/**
 * One session: header, transcript, blocking questions, composer. The id comes
 * from the URL, so a reload, a bookmark and a phone reattach all land on the
 * same transcript and the same live engine. A project session passes through the
 * trust gate first, so nothing attaches to a folder that is not trusted.
 */
import { useMemo } from "react";
import { transcript } from "shared";
import type { DialogQuestion, Place } from "shared";

import { ConfirmDialog, QuestionDialog } from "@/features/conversation/dialogs";
import { Transcript } from "@/features/conversation/transcript";
import { Composer } from "@/features/conversation/composer/composer";
import { useConversation } from "@/features/conversation/use-conversation";
import { ChatBar } from "@/features/conversation/chat-bar";
import { RunStatus } from "@/features/conversation/run-status";
import { ComposerPlace, SessionHeader } from "@/features/conversation/session-header";
import { ConversationWelcome } from "@/features/conversation/welcome";
import { SessionLoader } from "@/features/conversation/session-loader";
import { TrustGate } from "@/features/projects";

const isConfirm = (
	question: DialogQuestion,
): question is Extract<DialogQuestion, { method: "confirm" }> => question.method === "confirm";

/** `project` names the folder of a project session; without it the page is a chat. */
export function SessionView({ sessionId, project }: { sessionId: string; project?: string }) {
	if (project === undefined) {
		return <Conversation sessionId={sessionId} place={{ kind: "chat" }} />;
	}
	return (
		<TrustGate project={project} header={<ChatBar />}>
			<Conversation sessionId={sessionId} place={{ kind: "project", path: project }} />
		</TrustGate>
	);
}

function Conversation({ sessionId, place }: { sessionId: string; place: Place }) {
	const { store, snapshot } = useConversation(sessionId, place);
	const rows = transcript(snapshot.state);
	const { busy, dialogs, statuses, widgets, title, sessionName, commands } = snapshot.state;
	const { models, model, thinkingLevel, availableThinkingLevels, codingTools } = snapshot.state;
	const {
		contextUsage,
		stats,
		isCompacting,
		isRetrying,
		isBashRunning,
		autoCompaction,
		autoRetry,
		queue,
		branches,
	} = snapshot.state;
	const confirmations = dialogs.filter(isConfirm);
	const questions = dialogs.filter((dialog) => !isConfirm(dialog));
	const aboveComposer = widgets.filter((widget) => widget.placement === "aboveEditor");
	const belowComposer = widgets.filter((widget) => widget.placement === "belowEditor");
	/** pi fills the place in once the engine is up; until then the page's own answer holds. */
	const where = snapshot.state.place ?? place;
	const empty = rows.length === 0;
	// Every prop here survives a streaming token, so the element does too.
	const composer = useMemo(
		() => (
			<Composer
				store={store}
				busy={busy}
				isCompacting={isCompacting}
				branches={branches}
				models={models}
				model={model}
				thinkingLevel={thinkingLevel}
				availableThinkingLevels={availableThinkingLevels}
				statuses={statuses}
				commands={commands}
				codingTools={codingTools}
				contextUsage={contextUsage}
				cost={stats.cost}
				inline={empty}
				footer={<ComposerPlace place={where} />}
			/>
		),
		[
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
			stats.cost,
			empty,
			where,
		],
	);

	/** The rows above the composer change with a queue or a run state, never with a token. */
	const runStatus = useMemo(
		() => (
			<RunStatus
				isCompacting={isCompacting}
				isRetrying={isRetrying}
				isBashRunning={isBashRunning}
				bashCommand={snapshot.bashCommand}
				queue={queue}
				onAbortCompaction={() => store.abortCompaction()}
				onCancelRetry={() => store.cancelRetry()}
				onAbortBash={() => store.abortBash()}
				onClearQueue={() => store.clearQueue()}
			/>
		),
		[store, isCompacting, isRetrying, isBashRunning, snapshot.bashCommand, queue],
	);

	// A session that has no snapshot yet shows a loader, not an empty transcript.
	if (!snapshot.loaded) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<ChatBar />
				<SessionLoader snapshot={snapshot} />
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<SessionHeader
				sessionId={sessionId}
				store={store}
				title={title ?? sessionName}
				place={snapshot.state.place ?? place}
				busy={busy}
				empty={rows.length === 0}
				autoCompaction={autoCompaction}
				autoRetry={autoRetry}
				isCompacting={isCompacting}
				branches={branches}
			/>

			{questions.map((question) => (
				<QuestionDialog
					key={question.id}
					question={question}
					onAnswer={(answer) => store.answerDialog(answer)}
				/>
			))}
			{confirmations.map((question) => (
				<ConfirmDialog
					key={question.id}
					question={question}
					onAnswer={(answer) => store.answerDialog(answer)}
				/>
			))}

			{empty ? (
				// A conversation opens on the box that starts it, not a card above a footer.
				<ConversationWelcome place={where} composer={composer} status={runStatus} />
			) : (
				<>
					<Transcript rows={rows} />

					{widgets.length > 0 && (
						<div className="flex flex-col gap-1 border-t px-4 py-2 font-mono text-code whitespace-pre-wrap text-muted-foreground">
							{[...aboveComposer, ...belowComposer].map((widget) => (
								<div key={widget.key} data-placement={widget.placement}>
									{widget.lines.join("\n")}
								</div>
							))}
						</div>
					)}

					{runStatus}
					<div className="composer-settle">{composer}</div>
				</>
			)}
		</div>
	);
}
