import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { router } from "./core/router";

import "./index.css";

/**
 * The page's entry. The one RPC runtime is started by the first call a route makes; the
 * router owns the address, and the query cache is reached through its context.
 */
const container = document.getElementById("root");
if (container === null) throw new Error("index.html has no #root element");

createRoot(container).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
