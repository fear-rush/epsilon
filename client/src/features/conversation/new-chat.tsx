/**
 * Home: a new chat ready to type. The sidebar starts chats and projects; this
 * page is the chat landing. A `project` search still runs it in a trusted folder
 * for a bookmark or the project picker's Change action. The conversation is live
 * from the start so the model and tool controls work, and the URL becomes the
 * session id on the first message.
 */
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import type { Place } from "shared";

import { Composer } from "@/features/conversation/composer/composer";
import { ChatBar } from "@/features/conversation/chat-bar";
import { SessionLoader } from "@/features/conversation/session-loader";
import { ComposerPlace } from "@/features/conversation/session-header";
import { useConversation } from "@/features/conversation/use-conversation";
import { ConversationWelcome } from "@/features/conversation/welcome";
import { FolderDialog, TrustGate, useRecentProjects } from "@/features/projects";

export function NewChat({ project }: { project?: string }) {
	const navigate = useNavigate();
	const [sessionId] = useState(() => crypto.randomUUID());
	const [choosing, setChoosing] = useState(false);
	const openChooser = useCallback(() => setChoosing(true), []);
	const recent = useRecentProjects();

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<ChatBar />
			{project === undefined ? (
				<DraftConversation sessionId={sessionId} place={{ kind: "chat" }} />
			) : (
				<TrustGate project={project} header={null}>
					<DraftConversation
						sessionId={sessionId}
						place={{ kind: "project", path: project }}
						onChangeProject={openChooser}
					/>
				</TrustGate>
			)}
			<FolderDialog
				open={choosing}
				onOpenChange={setChoosing}
				title="Open a project"
				action="Open"
				recent={recent}
				onPick={(path) => void navigate({ to: "/", search: { project: path }, replace: true })}
			/>
		</div>
	);
}

function DraftConversation({
	sessionId,
	place,
	onChangeProject,
}: {
	sessionId: string;
	place: Place;
	onChangeProject?: () => void;
}) {
	const navigate = useNavigate();
	const { store, snapshot } = useConversation(sessionId, place);
	const {
		busy,
		statuses,
		commands,
		models,
		model,
		thinkingLevel,
		availableThinkingLevels,
		codingTools,
		contextUsage,
		stats,
	} = snapshot.state;
	const where = snapshot.state.place ?? place;

	const start = useCallback(
		() =>
			void navigate({
				to: "/sessions/$sessionId",
				params: { sessionId },
				search: { project: where.kind === "project" ? where.path : undefined },
			}),
		[navigate, sessionId, where],
	);

	// A streaming token leaves these props alone, so the box is not rebuilt.
	const composer = useMemo(
		() => (
			<Composer
				store={store}
				busy={busy}
				models={models}
				model={model}
				thinkingLevel={thinkingLevel}
				availableThinkingLevels={availableThinkingLevels}
				statuses={statuses}
				commands={commands}
				codingTools={codingTools}
				contextUsage={contextUsage}
				cost={stats.cost}
				inline
				onSent={start}
				footer={
					<ComposerPlace
						place={where}
						onChange={where.kind === "project" ? onChangeProject : undefined}
					/>
				}
			/>
		),
		[
			store,
			busy,
			models,
			model,
			thinkingLevel,
			availableThinkingLevels,
			statuses,
			commands,
			codingTools,
			contextUsage,
			stats.cost,
			onChangeProject,
			where,
			start,
		],
	);

	if (!snapshot.loaded) {
		return <SessionLoader snapshot={snapshot} />;
	}

	return <ConversationWelcome place={where} composer={composer} />;
}
