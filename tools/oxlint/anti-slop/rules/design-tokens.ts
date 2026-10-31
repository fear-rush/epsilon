import { defineRule } from "@oxlint/plugins";

import { defaultAllowed, findTokenViolations } from "../shared/design-tokens.ts";

import type { ESTree } from "@oxlint/plugins";

const classHelpers = new Set(["cn", "cva", "clsx"]);

function readAllowed(raw: unknown): string[] {
  const extra =
    typeof raw === "object" && raw !== null && "allow" in raw && Array.isArray(raw.allow)
      ? raw.allow.filter((entry): entry is string => typeof entry === "string")
      : [];
  return [...defaultAllowed, ...extra];
}

/** Calls the visitor with each string literal and static template part that can hold classes. */
function eachString(node: ESTree.Node | null | undefined, visit: (at: ESTree.Node, text: string) => void): void {
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
  }
}

/** Keep class names on the design tokens: no arbitrary values, raw palette, off-scale type or spacing. */
export const designTokensRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow arbitrary values, raw palette colours, off-scale text sizes and off-scale spacing in class names.",
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
    function scan(expression: ESTree.Node | null | undefined): void {
      const allowed = readAllowed(context.options[0]);
      eachString(expression, (at, text) => {
        for (const violation of findTokenViolations(text, allowed)) {
          context.report({ node: at, messageId: "token", data: { message: violation.message } });
        }
      });
    }

    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;
        const value = node.value;
        if (value === null) return;
        if (value.type === "JSXExpressionContainer") {
          if (value.expression.type !== "JSXEmptyExpression") scan(value.expression);
        } else {
          scan(value);
        }
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !classHelpers.has(node.callee.name)) return;
        for (const argument of node.arguments) {
          scan(argument.type === "SpreadElement" ? argument.argument : argument);
        }
      },
    };
  },
});
