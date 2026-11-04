import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { Chat } from "@/features/conversation/chat";

/** The project a saved chat runs in, so its folder is gated before an engine starts. */
const Search = Schema.Struct({ project: Schema.optional(Schema.NonEmptyString) });

export const Route = createFileRoute("/_app/sessions/$sessionId")({
	head: () => ({ meta: [{ title: "Chat · Epsilon" }] }),
	validateSearch: Schema.toStandardSchemaV1(Search),
	component: ChatRoute,
});

function ChatRoute() {
	const { sessionId } = Route.useParams();
	const { project } = Route.useSearch();
	// A saved chat is located on disk by its id, so the client never names the file.
	return <Chat place={project ?? null} sessionId={sessionId} />;
}
