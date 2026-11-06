import { defineRule } from "@oxlint/plugins";

import { classStringVisitors } from "../shared/classes.ts";
import { defaultAllowed, findTokenViolations } from "../shared/design-tokens.ts";

function readAllowed(raw: unknown): string[] {
	const extra =
		typeof raw === "object" && raw !== null && "allow" in raw && Array.isArray(raw.allow)
			? raw.allow.filter((entry): entry is string => typeof entry === "string")
			: [];
	return [...defaultAllowed, ...extra];
}

/** Keep class names on the design tokens: no arbitrary values, raw palette, off-scale type or spacing, or a radius step outside the roles. */
export const designTokensRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow arbitrary values, raw palette colours, off-scale text sizes, off-scale spacing and radius steps that are not a role in class names.",
		},
		schema: [
			{
				type: "object",
				properties: { allow: { type: "array", items: { type: "string" } } },
				additionalProperties: false,
			},
		],
		messages: { token: "{{message}}" },
	},
	createOnce(context) {
		return classStringVisitors((at, text) => {
			for (const violation of findTokenViolations(text, readAllowed(context.options[0]))) {
				context.report({
					node: at,
					messageId: "token",
					data: { message: `${violation.message} (see docs/rules/client.md CL-7)` },
				});
			}
		});
	},
});
