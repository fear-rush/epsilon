import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

function memberName(node: ESTree.Node | null | undefined): string | null {
	return node?.type === "MemberExpression" && node.property.type === "Identifier"
		? node.property.name
		: null;
}

function objectName(node: ESTree.Node | null | undefined): string | null {
	return node?.type === "MemberExpression" && node.object.type === "Identifier"
		? node.object.name
		: null;
}

/** Tests may not wait on or read the real clock; time is a service they advance. */
export const noRealSleepRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Disallow real sleeps and real clock reads in tests; advance TestClock instead.",
		},
		messages: {
			sleep:
				"`{{name}}` waits on the real clock. Advance time with `TestClock.adjust` or wait with `until()` from `test/until.ts`.",
			now: "`{{name}}` reads the real clock. Read time from the `Clock` service so a test can control it.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node) {
				const callee = node.callee;
				if (callee.type === "Identifier") {
					if (callee.name === "setTimeout" || callee.name === "setInterval") {
						context.report({ node, messageId: "sleep", data: { name: `${callee.name}()` } });
					}
					if (callee.name === "queueMicrotask") return;
					return;
				}
				const object = objectName(callee);
				const property = memberName(callee);
				if (object === "Bun" && property === "sleep") {
					context.report({ node, messageId: "sleep", data: { name: "Bun.sleep()" } });
					return;
				}
				if (
					(object === "Date" && property === "now") ||
					(object === "performance" && property === "now")
				) {
					context.report({ node, messageId: "now", data: { name: `${object}.now()` } });
				}
			},
		};
	},
});
