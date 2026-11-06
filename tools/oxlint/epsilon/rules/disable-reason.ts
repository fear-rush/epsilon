import { defineRule } from "@oxlint/plugins";

const directive = /^\s*oxlint-disable(?:-next-line|-line)?\b(.*)$/s;

/** Where a disable of a guarded rule is allowed: vendored code that is not ours to restyle. */
const allowedPaths = ["src/app/components/ui/", "src/app/components/editor/"];
const guarded = ["epsilon/design-tokens", "epsilon/feedback-surfaces"];

/** A disable carries its reason, and the rules that keep the UI on its tokens are never disabled in a feature. */
export const disableReasonRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require `-- <reason>` on every oxlint-disable comment and forbid disabling design-tokens or feedback-surfaces outside the vendored folders.",
		},
		messages: {
			reason:
				"This disable has no reason. Add ` -- <why this line is right>` after the rule names (see docs/rules/client.md CL-3).",
			guarded:
				"`{{rule}}` cannot be disabled here. Use the token or status surface, or add a role to DESIGN.md (see docs/rules/feedback.md FB-10, docs/rules/client.md CL-7).",
		},
	},
	createOnce(context) {
		return {
			Program() {
				const file = context.filename.replaceAll("\\", "/");
				const mayDisableGuarded = allowedPaths.some((path) => file.includes(path));
				for (const comment of context.sourceCode.getAllComments()) {
					const match = directive.exec(comment.value);
					if (match === null) continue;
					const [rules = "", reason] = (match[1] ?? "").split(/\s--\s/, 2);
					if (reason === undefined || reason.trim() === "") {
						context.report({ node: comment, messageId: "reason" });
					}
					if (mayDisableGuarded) continue;
					const rule = guarded.find((name) => rules.includes(name));
					if (rule !== undefined)
						context.report({ node: comment, messageId: "guarded", data: { rule } });
				}
			},
		};
	},
});
