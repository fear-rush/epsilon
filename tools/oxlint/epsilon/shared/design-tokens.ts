/** Pure matching for the `design-tokens` rule: which Tailwind classes step outside the tokens. */

import { splitClasses, stripVariants } from "./classes.ts";

export type TokenCategory = "bracket" | "palette" | "textSize" | "spacing" | "radius";

export type TokenViolation = {
	category: TokenCategory;
	/** The class as written, variants included. */
	className: string;
	/** One line naming the class and the token to use instead. */
	message: string;
};

export const defaultAllowed: readonly string[] = ["grid-cols-[minmax(0,1fr)]"];

const spacingSteps = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12];
const spacingNames = ["pane", "page", "row", "field", "card", "section", "auto", "px"];
const spacingUtilities = "gap-x|gap-y|space-x|space-y|gap|px|py|pt|pb|pl|pr|p|mx|my|mt|mb|ml|mr|m";

const palette =
	"slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const colorUtilities =
	"text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|divide|placeholder";

const paletteClass = new RegExp(
	`^(?:${colorUtilities})-(?:(?:${palette})-\\d+|black|white)(?:/.+)?$`,
);
const textSizeClass = /^text-(xs|sm|base|lg|xl|[2-9]xl)(?:\/.+)?$/;
const radiusRoles = new Set(["chip", "control", "card", "bubble", "pill", "none"]);
const radiusClass = /^rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br))?(?:-([a-z0-9]+))?$/;
/** The role that has the radius a registry step had; a step with no role gets no suggestion. */
const radiusByStep = new Map<string, string>([
	["md", "rounded-chip"],
	["lg", "rounded-control"],
	["xl", "rounded-card"],
	["2xl", "rounded-bubble"],
	["full", "rounded-pill"],
]);

const spacingClass = new RegExp(`^(?:${spacingUtilities})-(\\d+(?:\\.\\d+)?)$`);

const textRoles = {
	xs: "text-meta",
	sm: "text-body",
	base: "text-body",
	lg: "text-title",
	xl: "text-title",
} satisfies Record<string, string>;

/** A role lookup that tolerates a class the type scale does not name. */
const textRolesByKey = new Map<string, string>(Object.entries(textRoles));

function nearestStep(value: number): number {
	let best = spacingSteps[0] ?? 0;
	for (const step of spacingSteps) {
		if (Math.abs(step - value) < Math.abs(best - value)) best = step;
	}
	return best;
}

/*
 * Not checked, by design (DESIGN.md → Layout): width, height, grid, flex and position.
 * Icon sizes (`size-icon-sm`, `size-icon`, `size-icon-lg`) are left to review: a class
 * string does not know whether its element is an icon, so a rule would also fire on avatars
 * and buttons.
 */

/** Violations among the whitespace-separated classes in one string. */
export function findTokenViolations(
	text: string,
	allowed: readonly string[] = defaultAllowed,
): TokenViolation[] {
	const found: TokenViolation[] = [];
	for (const token of splitClasses(text)) {
		const utility = stripVariants(token).replace(/^!/, "").replace(/!$/, "");
		const bare = utility.replace(/^-/, "");
		const report = (category: TokenCategory, message: string): void => {
			found.push({ category, className: token, message });
		};

		if (utility.includes("[")) {
			// `transition-[height,opacity]` names the properties that change; it is not a value.
			if (allowed.includes(utility) || /^transition-\[[a-z,-]+\]$/.test(utility)) continue;
			report(
				"bracket",
				`\`${utility}\` is an arbitrary value; use a design token (add one to DESIGN.md → front matter) or a documented exception.`,
			);
			continue;
		}
		if (paletteClass.test(bare)) {
			report(
				"palette",
				`\`${utility}\` is a raw palette colour; use a semantic colour token such as bg-background, text-foreground or border-border (DESIGN.md → Colors).`,
			);
			continue;
		}
		const size = textSizeClass.exec(bare);
		if (size?.[1] !== undefined) {
			const key = size[1];
			const role = textRolesByKey.get(key) ?? "text-display";
			report(
				"textSize",
				`\`${utility}\` is outside the type scale; use \`${role}\` (DESIGN.md → Typography).`,
			);
			continue;
		}
		const radius = radiusClass.exec(bare);
		if (radius !== null) {
			const step = radius[1] ?? "";
			if (!radiusRoles.has(step)) {
				const role = radiusByStep.get(step);
				report(
					"radius",
					`\`${utility}\` is not a radius role; ${role === undefined ? "choose chip, control, card, bubble or pill" : `use \`${role}\``} (DESIGN.md → Shapes).`,
				);
			}
			continue;
		}
		const spacing = spacingClass.exec(bare);
		if (spacing?.[1] !== undefined) {
			const value = Number(spacing[1]);
			if (spacingSteps.includes(value)) continue;
			const prefix = bare.slice(0, bare.length - spacing[1].length);
			report(
				"spacing",
				`\`${utility}\` is not an allowed spacing step; use \`${prefix}${nearestStep(value)}\` or a named token (${spacingNames.join(", ")}) (DESIGN.md → Layout).`,
			);
		}
	}
	return found;
}
