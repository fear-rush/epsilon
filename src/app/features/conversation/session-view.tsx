/**
 * One session: header, transcript, blocking questions, composer. The id comes from the
 * URL, so a reload, a bookmark and a phone reattach all land on the same transcript and
 * the same live engine. A project session passes through the trust gate first, so nothing
 * attaches to a folder that is not trusted.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { transcript } from "#domain/conversation/selectors";
import type { ConversationState } from "#domain/conversation/state";
import type { DialogQuestion } from "#protocol/conversation/extui";
import type { ImageBlock } from "#protocol/conversation/frames";
import type { ModelOption } from "#protocol/conversation/session";
import type { ContextView } from "#protocol/settings/context";
import { noticeView } from "@/components/patterns/status/notice-view";
import { Button } from "@/components/ui/button";
import { call } from "@/core/runtime";
import { useReportStatus } from "@/core/status";
import { ContinueSession, TrustGate } from "@/features/projects";
import { useRecentProjects, useSessionRow } from "@/features/sessions";

import { ChatBar } from "./chat-bar";
import { Composer } from "./composer";
import { ConfirmDialog, QuestionDialog } from "./dialogs";
import { liveSteps } from "./live-steps";
import { RunStatus } from "./run-status";
import { ComposerPlace, SessionHeader, SessionLoader } from "./session-header";
import { Transcript } from "./transcript";
import { useBranching } from "./use-branching";
import { useConversation } from "./use-conversation";
import { ConversationWelcome } from "./welcome";

/** `project` names the folder of a project session; without it the page is a chat. */
const isConfirm = (
	question: DialogQuestion,
): question is Extract<DialogQuestion, { kind: "confirm" }> => question.kind === "confirm";
export function SessionView({
	sessionId,
	project,
	continued,
}: {
	sessionId: string;
	project?: string | undefined;
	/** The operator chose a folder for this open because the recorded one is gone. */
	continued?: boolean | undefined;
}) {
	const session = useSessionRow(sessionId);
	// Folders that already hold chats, offered first by the folder picker.
	const recent = useRecentProjects();
	if (session?.cwdMissing === true && continued !== true) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<ChatBar />
				<ContinueSession recent={recent} session={session} />
			</div>
		);
	}
	if (project === undefined) {
		return <Conversation sessionId={sessionId} place={null} />;
	}
	return (
		<TrustGate project={project} header={<ChatBar />}>
			<Conversation sessionId={sessionId} place={project} />
		</TrustGate>
	);
}

/**
 * One chat: the bar, the transcript, an in-chat search, the extension's questions and the
 * composer. Home renders it too, for a chat that has no file yet.
 *
 * The chat's own problems (a file rewritten elsewhere, an engine that stopped) are reported
 * to the app's status line rather than drawn here; the engine's notices, which are about a
 * turn, stay beside the transcript.
 */
export function Conversation({
	sessionId,
	place,
	onChangeProject,
}: {
	sessionId: string;
	place: string | null;
	/** The new chat page's Change action; an existing chat keeps its folder. */
	onChangeProject?: (() => void) | undefined;
}) {
	const conversation = useConversation({ place, sessionId });
	const { state } = conversation;
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	// A fork, a clone or `/new` writes a new file under a new id. The old id is only an
	// alias while the engine lives, so the page moves to the id the file now carries, and
	// the list refetches because a row appears under the new one.
	useEffect(() => {
		if (state.sessionId === undefined || state.sessionId === sessionId) return;
		void queryClient.invalidateQueries({ queryKey: ["sessions"] });
		void navigate({
			params: { sessionId: state.sessionId },
			replace: true,
			search: place === null ? {} : { project: place },
			to: "/sessions/$sessionId",
		});
	}, [state.sessionId, sessionId, navigate, place, queryClient]);

	const [anchorFrom, setAnchorFrom] = useState<number | undefined>(undefined);
	const loadModels = conversation.models;
	const [models, setModels] = useState<ReadonlyArray<ModelOption>>([]);
	useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			try {
				const next = await loadModels();
				if (!cancelled) setModels(next);
			} catch {
				// The picker says "Model" until a read works; the controls dialog shows the reason.
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [loadModels]);

	const rows = transcript(state);
	const empty = rows.length === 0;
	const taskSteps = liveSteps(state);
	const confirmations = state.dialogs.filter(isConfirm);
	const questions = state.dialogs.filter((dialog) => !isConfirm(dialog));
	const { blocked, cloning, openTree, openFork, clone, dialogs } = useBranching({
		busy: state.busy,
		conversation,
		empty,
		filterMode: state.treeFilterMode,
		isCompacting: state.compacting,
		tree: state.tree,
	});

	const send = async (
		text: string,
		behavior?: "steer" | "followUp",
		images?: ReadonlyArray<ImageBlock>,
	): Promise<void> => {
		if (behavior === "steer") await conversation.steer(text, images);
		else if (behavior === "followUp") await conversation.followUp(text, images);
		else await conversation.send(text, images);
		// The sent message scrolls to the top of the view; the reply grows below it (R9).
		setAnchorFrom(transcript(state).length);
	};

	useReportStatus("chat", chatReport(state), () => void conversation.reload());

	/** The rows above the composer change with a queue or a run state, never with a token. */
	const runStatus = (
		<RunStatus
			working={state.busy && state.workingVisible}
			workingMessage={state.workingMessage}
			steps={taskSteps}
			isCompacting={state.compacting}
			isRetrying={state.retrying}
			isBashRunning={state.bash.running}
			bashCommand={state.bash.command === "" ? undefined : state.bash.command}
			bashOutput={state.bash.output}
			queue={state.queue}
			drift={state.drift}
			notices={state.notices}
			onReload={() => void conversation.reload()}
			onAbortCompaction={() => void conversation.abortCompaction()}
			onCancelRetry={() => void conversation.cancelRetry()}
			onAbortBash={() => void conversation.abortBash()}
			onClearQueue={() => void conversation.clearQueue()}
		/>
	);
	const readContext = async (): Promise<ContextView> =>
		call((client) => client["settings.context.read"]({ folder: place }));
	const composer = (
		<Composer
			busy={state.busy}
			blocked={blocked}
			codingTools={state.codingTools}
			commands={state.commands}
			draft={state.draft}
			inline={empty}
			header={
				place === null ? undefined : <ComposerPlace path={place} onChange={onChangeProject} />
			}
			model={models.find((candidate) => `${candidate.provider}/${candidate.id}` === state.model)}
			models={models}
			sessionId={sessionId}
			state={state}
			thinking={state.thinking}
			thinkingLevels={state.thinkingLevels}
			writable={conversation.writable}
			onAbort={conversation.abort}
			onBash={conversation.bash}
			onClone={clone}
			onExport={conversation.exportSession}
			onOpenFork={openFork}
			onOpenTree={openTree}
			onReadContext={readContext}
			onSend={send}
			onSetCodingTools={(enabled) => void conversation.setCodingTools(enabled)}
			onSetModel={(provider, modelId) => void conversation.setModel(provider, modelId)}
			onSetPermission={(mode) => void conversation.setPermission(mode)}
			onSetThinking={(level) => void conversation.setThinking(level)}
			onSuggest={conversation.suggest}
		/>
	);

	/** The branch's own controls, kept in the header until they have a home of their own. */
	const extras = state.busy ? (
		<Button variant="outline" size="sm" onClick={() => void conversation.abort()}>
			Stop
		</Button>
	) : undefined;
	const header = (
		<SessionHeader
			actions={extras}
			autoCompaction={state.autoCompaction}
			autoRetry={state.autoRetry}
			blocked={blocked}
			busy={state.busy}
			cloning={cloning}
			conversation={conversation}
			empty={empty}
			hideThinkingBlock={state.hideThinking}
			isCompacting={state.compacting}
			onClone={clone}
			onFork={openFork}
			onTree={openTree}
			place={place}
			sessionId={sessionId}
			// pi names a chat only when it is renamed; an unnamed one shows no title, as main did.
			title={state.title}
		/>
	);

	// A session that has no snapshot yet shows a loader, not an empty transcript.
	if (!conversation.loaded) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<ChatBar />
				<SessionLoader />
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{header}
			{questions.map((question) => (
				<QuestionDialog
					key={question.id}
					question={question}
					onAnswer={(answer) => void conversation.answer(answer)}
				/>
			))}
			{confirmations.map((question) => (
				<ConfirmDialog
					key={question.id}
					question={question}
					onAnswer={(answer) => void conversation.answer(answer)}
				/>
			))}
			{empty ? (
				// A conversation opens on the box that starts it, not a card above a footer.
				<ConversationWelcome
					composer={composer}
					place={place === null ? "chat" : "project"}
					status={runStatus}
				/>
			) : (
				<>
					<Transcript
						state={state}
						onLoadOlder={() => void conversation.loadOlder()}
						loadingOlder={conversation.loadingOlder}
						olderFailure={conversation.olderFailure}
						onLoadTree={conversation.loadTree}
						anchorFrom={anchorFrom}
						onAnchored={() => setAnchorFrom(undefined)}
						toolOpen={conversation.toolOpen}
						onToggleTool={conversation.toggleTool}
					/>
					{runStatus}
					<div className="animate-enter-rise">{composer}</div>
				</>
			)}
			{dialogs}
		</div>
	);
}

/**
 * What the chat wants the status line to say: the engine's own stop, in its own words.
 * A file rewritten elsewhere is the run status's row above the composer, as in main.
 */
function chatReport(state: ConversationState) {
	const stopped = state.notices.findLast((notice) => notice.kind === "error");
	if (stopped !== undefined) {
		const view = noticeView(stopped);
		return { text: view.text, tone: view.tone };
	}
	return undefined;
}
