import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SessionView } from "@/features/conversation/session-view";

/** `project` is the folder a project session runs in; a chat has none. */
const searchSchema = z.object({
	project: z.string().min(1).optional().catch(undefined),
	/** Set when the operator chose a folder for an open whose recorded one is gone. */
	continued: z.literal("1").optional().catch(undefined),
});

export const Route = createFileRoute("/_app/sessions/$sessionId")({
	head: () => ({ meta: [{ title: "Chat · Epsilon" }] }),
	validateSearch: searchSchema,
	component: function Session() {
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
	},
});
