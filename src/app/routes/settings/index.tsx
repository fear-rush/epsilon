import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/")({
	beforeLoad: () => {
		// Replace, so Back from General does not land on this redirect again.
		throw redirect({ to: "/settings/general", replace: true });
	},
});
