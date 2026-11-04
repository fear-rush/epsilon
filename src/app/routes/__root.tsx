import { createRootRoute } from "@tanstack/react-router";

/**
 * The shell every route sits in. Step 8 replaces this placeholder with the real layout and
 * adds the routes; today it proves the built page reaches a browser.
 */
export const Route = createRootRoute({ component: Root });

function Root() {
	return (
		<main className="mx-auto max-w-xl p-8">
			<h1 className="text-title font-semibold">Epsilon is running</h1>
			<p className="mt-2">
				The dashboard is being rebuilt. Its pages arrive with the client step; the server, the
				socket and the configuration features are here.
			</p>
		</main>
	);
}
