/**
 * No session open. The list lives in the sidebar now, so this page says what to
 * do instead of repeating it.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { SidebarTrigger } from "@/components/ui/sidebar";

export const Route = createFileRoute("/")({
	component: function Home() {
		const navigate = useNavigate();
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<header className="flex items-center gap-2 border-b px-3 py-1.5">
					<SidebarTrigger />
					<span className="text-sm font-medium">epsilon</span>
				</header>
				<div className="flex flex-1 items-center justify-center p-6">
					<Empty>
						<EmptyHeader>
							<EmptyTitle>No session open</EmptyTitle>
							<EmptyDescription>
								Pick a session in the sidebar, or start a new one.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button
								onClick={() =>
									void navigate({
										to: "/sessions/$sessionId",
										params: { sessionId: crypto.randomUUID() },
									})
								}
							>
								New session
							</Button>
						</EmptyContent>
					</Empty>
				</div>
			</div>
		);
	},
});
