/** The horizontal padding a bar or band uses: a nav or list pane, or a detail page. */
export type Gutter = "pane" | "page";

/** The padding utility for a gutter. */
export const GUTTER_CLASS: Record<Gutter, string> = {
	pane: "px-pane",
	page: "px-page",
};
