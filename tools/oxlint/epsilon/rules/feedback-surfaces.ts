import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { classStringVisitors, splitClasses, stripVariants } from "../shared/classes.ts";

/**
 * The colour utilities the status surfaces own. A feature names a `Tone` and the surface
 * picks the colour, so the same state looks the same everywhere and changing the palette is
 * one file.
 */
const SURFACE_COLOURS = new Set([
	"text-destructive",
	"bg-destructive",
	"border-destructive",
	"text-warning",
	"bg-warning",
	"border-warning",
	"text-success",
	"bg-success",
	"border-success",
	"text-info",
	"bg-info",
	"border-info",
]);

const ALERT = "components/ui/alert";

/** Whether a specifier names shadcn's alert banner rather than `alert-dialog`. */
function isAlert(specifier: string): boolean {
	const path = specifier.replace(/\.(ts|tsx|js|mjs)$/, "");
	return path === `@/${ALERT}` || path.endsWith(`/${ALERT}`);
}

/** The class itself when it paints a surface colour, variants and opacity included, or null. */
function surfaceColour(token: string): string | null {
	const utility = stripVariants(token).replace(/^!/, "").replace(/!$/, "");
	const name = utility.split("/")[0] ?? "";
	return SURFACE_COLOURS.has(name) ? token : null;
}

/** Keep status colour in the status surfaces, where the tone vocabulary lives. */
export const feedbackSurfacesRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow a feature or route painting a status colour itself, or importing the alert banner; use the status surfaces.",
		},
		messages: {
			import:
				"`@/components/ui/alert` is the status surfaces' own banner; use `Notice`, or `StatusView` for a whole pane.",
			colour:
				"`{{className}}` paints a state outside the status surfaces; pass a `Tone` to `StatusView`, `Notice` or `InlineStatus` instead.",
		},
	},
	createOnce(context) {
		function checkImport(node: ESTree.Node, specifier: unknown): void {
			if (typeof specifier !== "string" || !isAlert(specifier)) return;
			context.report({ node, messageId: "import" });
		}

		return {
			ImportDeclaration(node) {
				checkImport(node, node.source.value);
			},
			ImportExpression(node) {
				if (node.source.type === "Literal") checkImport(node, node.source.value);
			},
			ExportNamedDeclaration(node) {
				if (node.source !== null) checkImport(node, node.source.value);
			},
			ExportAllDeclaration(node) {
				checkImport(node, node.source.value);
			},
			...classStringVisitors((at, text) => {
				for (const token of splitClasses(text)) {
					const colour = surfaceColour(token);
					if (colour === null) continue;
					context.report({ node: at, messageId: "colour", data: { className: colour } });
				}
			}),
		};
	},
});
