/**
 * The app's class merger: `cn` taught the design tokens in `styles/tokens.css`.
 * The stock merger reads `text-title` as a colour (so `text-title
 * text-muted-foreground` would drop the size) and does not know `h-bar` or
 * `max-w-dialog-md`, so it could not let a later class win over them.
 */
import { createCn } from "cn/config";

const TEXT_ROLES = ["display", "title", "section", "body", "meta", "code"];
const SPACING = ["bar", "band", "nav", "list", "pane", "page", "row", "field", "card", "section"];
const CONTAINERS = ["content", "dialog-sm", "dialog-md", "dialog-lg"];

export const cn = createCn({
	extend: {
		theme: {
			spacing: [...SPACING, "dialog-body-sm", "dialog-body-md", "dialog-body-lg"],
			container: CONTAINERS,
		},
		classGroups: { "font-size": [{ text: TEXT_ROLES }] },
	},
});
