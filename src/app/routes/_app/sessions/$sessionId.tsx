import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { SessionView } from "@/features/conversation/session-view";

/**
 * `project` is the folder a project session runs in; a chat has none. `continued` is set
 * when the operator chose a folder for an open whose recorded one is gone.
 */
const Search = Schema.Struct({
	project: Schema.optional(Schema.NonEmptyString),
	continued: Schema.optional(Schema.Literal("1")),
});

export const Route = createFileRoute("/_app/sessions/$sessionId")({
	head: () => ({ meta: [{ title: "Chat · Epsilon" }] }),
	validateSearch: Schema.toStandardSchemaV1(Search),
	component: ChatRoute,
});

function ChatRoute() {
	const { sessionId } = Route.useParams();
	const { project, continued } = Route.useSearch();
	// Keyed by all three, so switching place remounts instead of reusing a gate's state.
	return (
		<SessionView
			key={`${sessionId}\0${project ?? ""}\0${continued ?? ""}`}
			sessionId={sessionId}
			project={project}
			continued={continued !== undefined}
		/>
	);
}
