import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: function Index() {
		return (
			<div className="flex flex-1 items-center justify-center p-6">
				<Empty>
					<EmptyHeader>
						<EmptyTitle>No session yet</EmptyTitle>
						<EmptyDescription>
							The agent layer is not wired up. Milestone M0 in docs/plan.md is the pi child process,
							and the transcript arrives in M2.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	},
});
