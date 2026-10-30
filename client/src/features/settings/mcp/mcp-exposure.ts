/**
 * The four exposures pi reads, written once: the server-level picker and the
 * per-tool rows both map this list, so a label cannot say one thing in two
 * places.
 */
import type { McpExposure } from "shared";

export const exposureItems: { value: McpExposure; label: string }[] = [
	{ value: "codemode", label: "Codemode (default)" },
	{ value: "deferred", label: "Deferred (tool search)" },
	{ value: "direct", label: "Direct (declared to the model)" },
	{ value: "hidden", label: "Hidden (registered, unreachable)" },
];

/** The same list with the label only, for a row that shares its line with a text field. */
export const exposureShortItems: { value: McpExposure; label: string }[] = [
	{ value: "codemode", label: "Codemode" },
	{ value: "deferred", label: "Deferred" },
	{ value: "direct", label: "Direct" },
	{ value: "hidden", label: "Hidden" },
];

export const exposureDescription: Record<McpExposure, string> = {
	codemode: "Callable from codemode scripts, but not declared to the model.",
	deferred: "tool_search loads it when the model asks for it, then calls it directly.",
	direct: "Declared to the model like a built-in tool. Use it for a small, frequent set.",
	hidden: "Registered but unreachable. Useful with toolExposure rules that expose single tools.",
};
