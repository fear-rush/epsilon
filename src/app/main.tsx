import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { routeTree } from "./routeTree.gen";

import "./index.css";

/**
 * The page's entry. The one RPC runtime, the query client and the reconnect banner arrive
 * with the client step; the router is here so the build emits the page the server serves.
 */
const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const container = document.getElementById("root");
if (container === null) throw new Error("index.html has no #root element");

createRoot(container).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
