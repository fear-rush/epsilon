/**
 * What a session shows before its snapshot: the engine starting, or an engine that
 * did not start. Connection and version problems belong to the app banner, so the
 * pane only waits. The home page uses it too, so a new chat cannot spin in silence.
 */
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";
import { errorView } from "@/components/patterns/status/error-view";
import type { ConversationSnapshot } from "@/features/conversation/store";

export function SessionLoader({ snapshot }: { snapshot: ConversationSnapshot }) {
	if (snapshot.startError !== undefined) {
		return (
			<StatusView {...errorView(new Error(snapshot.startError))} title="The agent did not start" />
		);
	}
	return (
		<div className="flex min-h-0 flex-1 items-center justify-center animate-enter-fade">
			<LoadingState label="Loading the session…" />
		</div>
	);
}
