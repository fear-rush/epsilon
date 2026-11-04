import { useState } from "react";

import { Chat } from "./chat";

/**
 * Home: a chat that does not exist on disk yet.
 *
 * The id is made here and pi writes the first line when the first message runs, so an
 * abandoned draft leaves no file behind. A project chat passes its folder from the URL; a
 * plain chat runs in Epsilon's own chat folder, which the server names.
 */
export function NewChat({ place }: { place: string | null }) {
	const [sessionId] = useState(() => crypto.randomUUID());
	return <Chat place={place} sessionId={sessionId} />;
}
