import { defineRule } from "@oxlint/plugins";
const forbiddenImports = new Map([
	["node:fs", "Effect's FileSystem service"],
	["node:fs/promises", "Effect's FileSystem service"],
	["node:child_process", "Effect's ChildProcessSpawner (or `platform/process.ts`)"],
]);

const forbiddenCalls = new Map([
	["setTimeout", "Effect.sleep"],
	["setInterval", "Effect.sleep in a forkScoped fiber"],
	["queueMicrotask", "Effect.yieldNow"],
]);

/** Server and engine code reports failure through Effect instead of throwing or chaining Promises. */
export const effectOnlyIoRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow imperative IO, ambient time and thrown errors outside the platform layer; use the Effect service instead.",
		},
		messages: {
			attempt:
				"`{{name}}` is imperatively handled here. Yield an Effect that fails and let the caller `catchTag`.",
			call: "`{{name}}` is ambient IO. Use `{{replacement}}`.",
			import: "`{{name}}` bypasses the platform layer. Use `{{replacement}}`.",
			member:
				"`{{name}}` is ambient process state. Use the service that owns it (`{{replacement}}`).",
			promise:
				"A Promise chain here bypasses the Effect error channel. Wrap it with `Effect.tryPromise` or use the service.",
		},
	},
	createOnce(context) {
		return {
			ImportDeclaration(node) {
				const source = node.source.value;
				if (typeof source !== "string") return;
				const replacement = forbiddenImports.get(source);
				if (replacement !== undefined) {
					context.report({ node, messageId: "import", data: { name: source, replacement } });
				}
			},
			TryStatement(node) {
				context.report({ node, messageId: "attempt", data: { name: "try/catch" } });
			},
			ThrowStatement(node) {
				context.report({ node, messageId: "attempt", data: { name: "throw" } });
			},
			NewExpression(node) {
				if (node.callee.type === "Identifier" && node.callee.name === "Promise") {
					context.report({ node, messageId: "attempt", data: { name: "new Promise" } });
				}
			},
			CallExpression(node) {
				const callee = node.callee;
				if (callee.type === "Identifier") {
					const replacement = forbiddenCalls.get(callee.name);
					if (replacement !== undefined) {
						context.report({
							node,
							messageId: "call",
							data: { name: `${callee.name}()`, replacement },
						});
					}
					return;
				}
				if (callee.type !== "MemberExpression") return;
				const property = callee.property.type === "Identifier" ? callee.property.name : null;
				if (property === "then" || property === "catch") {
					context.report({ node, messageId: "promise" });
					return;
				}
				const object = callee.object.type === "Identifier" ? callee.object.name : null;
				if (object === "process" && property === "exit") {
					context.report({
						node,
						messageId: "member",
						data: { name: "process.exit()", replacement: "Effect.die / the supervisor's shutdown" },
					});
				}
				if (object === "Date" && property === "now") {
					context.report({
						node,
						messageId: "member",
						data: { name: "Date.now()", replacement: "Clock.currentTimeMillis" },
					});
				}
			},
			MemberExpression(node) {
				if (
					node.object.type === "Identifier" &&
					node.object.name === "process" &&
					node.property.type === "Identifier" &&
					node.property.name === "env"
				) {
					context.report({
						node,
						messageId: "member",
						data: {
							name: "process.env",
							replacement: "Effect Config, or a value passed by `main.ts`",
						},
					});
				}
			},
		};
	},
});
