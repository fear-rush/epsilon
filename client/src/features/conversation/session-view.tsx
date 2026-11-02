/**
 * One session: header, transcript, blocking questions, composer. The id comes
 * from the URL, so a reload, a bookmark and a phone reattach all land on the
 * same transcript and the same live engine. A project session passes through the
 * trust gate first, so nothing attaches to a folder that is not trusted.
 */
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { transcript } from "shared";
import type { DialogQuestion, Place } from "shared";

import { ConfirmDialog, QuestionDialog } from "@/features/conversation/dialogs";
import { sessionKeys } from "@/api/keys";
import { Transcript } from "@/features/conversation/transcript";
import { Composer } from "@/features/conversation/composer/composer";
import { useConversation } from "@/features/conversation/use-conversation";
import { useBranching } from "@/features/conversation/use-branching";
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
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const project = place.kind === "project" ? place.path : undefined;
	/**
	 * pi can replace the session under this chat (`/new`, a fork, a switch), and the
	 * chat continues on a new id. Follow it. The old id still reaches the same chat
	 * server-side, so this only changes the address the page keeps; the list needs a
	 * refetch because the replacement writes a row under the new id.
	 */
	const replacedTo = snapshot.replacedTo;
	useEffect(() => {
		if (replacedTo === undefined) return;
		void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
		void navigate({
			to: "/sessions/$sessionId",
			params: { sessionId: replacedTo },
			search: project === undefined ? {} : { project },
			replace: true,
		});
	}, [replacedTo, navigate, project, queryClient]);
	const rows = transcript(snapshot.state);
	const { busy, dialogs, statuses, widgets, title, sessionName, commands } = snapshot.state;
	const { models, model, thinkingLevel, availableThinkingLevels, codingTools } = snapshot.state;
	const {
		contextUsage,
		stats,
		cacheWarming,
		isCompacting,
		isRetrying,
		isBashRunning,
		bash,
		hideThinkingBlock,
		autoCompaction,
		autoRetry,
		queue,
		tree,
		drift,
		editorRequest,
		workingMessage,
		workingVisible,
		hiddenThinkingLabel,
		toolsExpanded,
	} = snapshot.state;
	const confirmations = dialogs.filter(isConfirm);
	const questions = dialogs.filter((dialog) => !isConfirm(dialog));
	/** pi fills the place in once the engine is up; until then the page's own answer holds. */
	const where = snapshot.state.place ?? place;
	const empty = rows.length === 0;
	const {
		blocked,
		cloning,
		composerKey,
		openTree,
		openFork,
		clone: cloneChat,
		dialogs: branchDialogs,
	} = useBranching({
		store,
		tree,
		empty,
		project: where.kind === "project" ? where.path : undefined,
		busy,
		isCompacting,
	});
	// Every prop here survives a streaming token, so the element does too.
	const composer = useMemo(
		() => (
			<Composer
				key={composerKey}
				store={store}
				busy={busy}
				tree={tree}
				empty={empty}
				blocked={blocked}
				isCompacting={isCompacting}
				onTree={openTree}
				onFork={openFork}
				onClone={cloneChat}
				models={models}
				model={model}
				thinkingLevel={thinkingLevel}
				availableThinkingLevels={availableThinkingLevels}
				statuses={statuses}
				commands={commands}
				codingTools={codingTools}
				contextUsage={contextUsage}
				stats={stats}
				cacheWarming={cacheWarming}
				inline={empty}
				header={where.kind === "project" ? <ComposerPlace place={where} /> : undefined}
				restoreDraft={snapshot.restoreDraft}
				editorRequest={editorRequest}
				suggestions={snapshot.suggestions}
				widgets={widgets}
			/>
		),
		[
			store,
			busy,
			tree,
			blocked,
			isCompacting,
			openTree,
			openFork,
			cloneChat,
			composerKey,
			editorRequest,
			snapshot.suggestions,
			widgets,
			models,
			model,
			thinkingLevel,
			availableThinkingLevels,
			statuses,
			commands,
			codingTools,
			contextUsage,
			stats,
			cacheWarming,
			empty,
			where,
			snapshot.restoreDraft,
		],
	);

	/** The rows above the composer change with a queue or a run state, never with a token. */
	const runStatus = useMemo(
		() => (
			<RunStatus
				working={busy && workingVisible}
				workingMessage={workingMessage}
				isCompacting={isCompacting}
				isRetrying={isRetrying}
				isBashRunning={isBashRunning}
				bashCommand={snapshot.bashCommand}
				bashOutput={bash?.output ?? ""}
				queue={queue}
				drift={drift}
				onReload={() => store.reloadSession()}
				onAbortCompaction={() => store.abortCompaction()}
				onCancelRetry={() => store.cancelRetry()}
				onAbortBash={() => store.abortBash()}
				onClearQueue={() => store.clearQueue()}
			/>
		),
		[
			store,
			busy,
			workingVisible,
			workingMessage,
			isCompacting,
			isRetrying,
			isBashRunning,
			snapshot.bashCommand,
			bash,
			queue,
			drift,
		],
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
				hideThinkingBlock={hideThinkingBlock}
				isCompacting={isCompacting}
				blocked={blocked}
				cloning={cloning}
				onTree={openTree}
				onFork={openFork}
				onClone={cloneChat}
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
					<Transcript
						rows={rows}
						toolsExpanded={toolsExpanded}
						hiddenThinkingLabel={hiddenThinkingLabel}
					/>

					{runStatus}
					<div className="animate-enter-rise">{composer}</div>
				</>
			)}
			{branchDialogs}
		</div>
	);
}
