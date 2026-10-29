import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/providers/")({
	component: function ProvidersPlaceholder() {
		return (
			<div className="hidden h-full items-center justify-center p-8 md:flex">
				<p className="max-w-sm text-center text-sm text-muted-foreground">
					Select a provider on the left, or add one below the list.
				</p>
			</div>
		);
	},
});
