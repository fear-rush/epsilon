import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { FolderDialog, TrustGate } from "@/features/projects";
import { useRecentProjects } from "@/features/sessions";

import { Conversation } from "./session-view";

/**
 * Home: a chat that does not exist on disk yet.
 *
 * The id is made here and pi writes the first line when the first message runs, so an
 * abandoned draft leaves no file behind. A project chat passes its folder from the URL; a
 * plain chat runs in Epsilon's own chat folder, which the server names.
 */
export function NewChat({ place }: { place: string | null }) {
	const [sessionId] = useState(() => crypto.randomUUID());
	const [choosing, setChoosing] = useState(false);
	const openChooser = useCallback(() => setChoosing(true), []);
	const recent = useRecentProjects();
	const navigate = useNavigate();
	return (
		<>
			{place === null ? (
				<Conversation place={null} sessionId={sessionId} />
			) : (
				<TrustGate project={place} header={null}>
					<Conversation place={place} sessionId={sessionId} onChangeProject={openChooser} />
				</TrustGate>
			)}
			<FolderDialog
				open={choosing}
				onOpenChange={setChoosing}
				title="Open a project"
				action="Open"
				recent={recent}
				onPick={(path) => void navigate({ to: "/", search: { place: path }, replace: true })}
			/>
		</>
	);
}
