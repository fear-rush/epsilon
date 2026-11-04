/** Shared class-string handling for the rules that read Tailwind classes. */

import type { ESTree } from "@oxlint/plugins";

/** Calls that build a class string out of their arguments. */
export const classHelpers = new Set(["cn", "cva", "clsx"]);

/** Split on whitespace; a bracketed value never holds a space of its own. */
export function splitClasses(text: string): string[] {
	return text.split(/\s+/).filter((part) => part !== "");
}

/** The utility after its variant prefixes; colons inside brackets belong to a variant or value. */
export function stripVariants(token: string): string {
	let depth = 0;
	let start = 0;
	for (let index = 0; index < token.length; index++) {
		const char = token[index];
		if (char === "[" || char === "(") depth++;
		else if (char === "]" || char === ")") depth--;
		else if (char === ":" && depth === 0) start = index + 1;
	}
	return token.slice(start);
}

/** Calls `visit` with each string literal and static template part that can hold classes. */
function eachString(
	node: ESTree.Node | null | undefined,
	visit: (at: ESTree.Node, text: string) => void,
): void {
	if (node === null || node === undefined) return;
	switch (node.type) {
		case "Literal":
			if (typeof node.value === "string") visit(node, node.value);
			return;
		case "TemplateLiteral":
			for (const part of node.quasis) visit(part, part.value.cooked ?? part.value.raw);
			return;
		case "ConditionalExpression":
			eachString(node.consequent, visit);
			eachString(node.alternate, visit);
			return;
		case "LogicalExpression":
		case "BinaryExpression":
			eachString(node.left, visit);
			eachString(node.right, visit);
			return;
		case "ArrayExpression":
			for (const element of node.elements) {
				eachString(element?.type === "SpreadElement" ? element.argument : element, visit);
			}
			return;
		case "ObjectExpression":
			for (const property of node.properties) {
				if (property.type === "SpreadElement") continue;
				if (!property.computed) eachString(property.key, visit);
				eachString(property.value, visit);
			}
			return;
		case "ParenthesizedExpression":
		case "TSAsExpression":
		case "TSSatisfiesExpression":
			eachString(node.expression, visit);
			return;
		default:
			return;
	}
}

/** The visitors that reach every class string a component writes. */
export type ClassStringVisitors = {
	JSXAttribute(node: ESTree.JSXAttribute): void;
	CallExpression(node: ESTree.CallExpression): void;
};

/**
 * A `className` attribute and the arguments of a class helper, each string handed to `visit`.
 */
export function classStringVisitors(
	visit: (at: ESTree.Node, text: string) => void,
): ClassStringVisitors {
	return {
		JSXAttribute(node) {
			if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;
			const value = node.value;
			if (value === null) return;
			if (value.type === "JSXExpressionContainer") {
				if (value.expression.type !== "JSXEmptyExpression") eachString(value.expression, visit);
			} else {
				eachString(value, visit);
			}
		},
		CallExpression(node) {
			if (node.callee.type !== "Identifier" || !classHelpers.has(node.callee.name)) return;
			for (const argument of node.arguments) {
				eachString(argument.type === "SpreadElement" ? argument.argument : argument, visit);
			}
		},
	};
}
