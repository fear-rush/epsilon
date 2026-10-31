import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SessionView } from "@/features/conversation/session-view";

/** `project` is the folder a project session runs in; a chat has none. */
const searchSchema = z.object({ project: z.string().min(1).optional() });

export const Route = createFileRoute("/_app/sessions/$sessionId")({
	validateSearch: searchSchema,
	component: function Session() {
		const { sessionId } = Route.useParams();
		const { project } = Route.useSearch();
		// Keyed by both, so switching place remounts instead of reusing a gate's state.
		return (
			<SessionView key={`${sessionId}\0${project ?? ""}`} sessionId={sessionId} project={project} />
		);
	},
});
