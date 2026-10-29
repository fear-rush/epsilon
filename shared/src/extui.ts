/**
 * The extension UI vocabulary the browser renders. An embedded engine answers
 * pi's `ExtensionUIContext` calls directly, so these are Epsilon's own shapes,
 * not pi's own wire types (docs/adr/0009-socket-speaks-epsilon.md).
 */
import { z } from "zod";

/** A request that blocks the agent until the browser answers it. */
export const dialogQuestionSchema = z.discriminatedUnion("method", [
	z.object({
		id: z.string(),
		method: z.literal("select"),
		title: z.string(),
		options: z.array(z.string()),
	}),
	z.object({
		id: z.string(),
		method: z.literal("confirm"),
		title: z.string(),
		message: z.string(),
	}),
	z.object({
		id: z.string(),
		method: z.literal("input"),
		title: z.string(),
		placeholder: z.string().optional(),
	}),
	z.object({
		id: z.string(),
		method: z.literal("editor"),
		title: z.string(),
		prefill: z.string().optional(),
	}),
]);

export type DialogQuestion = z.infer<typeof dialogQuestionSchema>;

/** One answer, correlated by the question's id. The first answer wins. */
export const dialogAnswerSchema = z.union([
	z.object({ id: z.string(), value: z.string() }),
	z.object({ id: z.string(), confirmed: z.boolean() }),
	z.object({ id: z.string(), cancelled: z.literal(true) }),
]);

export type DialogAnswer = z.infer<typeof dialogAnswerSchema>;

/**
 * A method that shows something and never waits. `setStatus` and `setWidget`
 * are keyed and replayed to a late-attaching tab; the rest happen once.
 */
export const extensionDisplaySchema = z.discriminatedUnion("method", [
	z.object({
		method: z.literal("notify"),
		message: z.string(),
		notifyType: z.enum(["info", "warning", "error"]).optional(),
	}),
	z.object({
		method: z.literal("setStatus"),
		statusKey: z.string(),
		statusText: z.string().optional(),
	}),
	z.object({
		method: z.literal("setWidget"),
		widgetKey: z.string(),
		widgetLines: z.array(z.string()).optional(),
		widgetPlacement: z.enum(["aboveEditor", "belowEditor"]).optional(),
	}),
	z.object({ method: z.literal("setTitle"), title: z.string() }),
	z.object({ method: z.literal("set_editor_text"), text: z.string() }),
]);

export type ExtensionDisplay = z.infer<typeof extensionDisplaySchema>;
