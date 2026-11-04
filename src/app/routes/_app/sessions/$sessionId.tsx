import { createFileRoute } from "@tanstack/react-router";

import { Chat } from "@/features/conversation/chat";

export const Route = createFileRoute("/_app/sessions/$sessionId")({
	head: () => ({ meta: [{ title: "Chat · Epsilon" }] }),
	component: ChatRoute,
});

function ChatRoute() {
	const { sessionId } = Route.useParams();
	// A saved chat is located on disk by its id, so the client never names the file.
	return <Chat place={null} sessionId={sessionId} />;
}
