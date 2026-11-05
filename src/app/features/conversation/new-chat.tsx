import { useState } from "react";

import { TrustGate } from "@/features/projects";

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
	if (place === null) return <Conversation place={null} sessionId={sessionId} />;
	return (
		<TrustGate project={place} header={null}>
			<Conversation place={place} sessionId={sessionId} />
		</TrustGate>
	);
}
