import { createFileRoute } from "@tanstack/react-router";

import { SessionView } from "@/features/conversation/session-view";

export const Route = createFileRoute("/_app/sessions/$sessionId")({
	component: function Session() {
		const { sessionId } = Route.useParams();
		return <SessionView sessionId={sessionId} />;
	},
});
