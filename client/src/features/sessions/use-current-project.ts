/**
 * The project the page is in, if any. Every route keeps the folder it works in on
 * `project` in its search, so the sidebar reads the location instead of a prop it is
 * never given.
 */
import { useRouterState } from "@tanstack/react-router";

export const useCurrentProject = (): string | undefined =>
	useRouterState({ select: (state) => state.location.search.project });
