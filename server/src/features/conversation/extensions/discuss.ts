/**
 * Epsilon's ask-question tool: one `discuss` call, a question, optional preset
 * answers, and a free-text path (docs/DECISIONS.md,
 * Default extensions). Ported from the operator extension of the same name, except for the
 * popup: that version draws its own component through `ctx.ui.custom`, which only a
 * terminal can render. Here the question is the browser's `select` dialog and
 * "Type something." is its `input` dialog, which every tab can answer and a late
 * tab receives again.
 *
 * The parameters are a zod schema, converted to JSON Schema because pi's tool
 * registry takes JSON Schema. zod stays the only schema language in the repo
 * (AGENTS.md, Invariants); the conversion is generated, never hand-written.
 */
import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

const optionSchema = z.object({
	label: z.string().describe("Display label for the option"),
	description: z.string().optional().describe("Optional one-line detail under the option"),
});

const paramsSchema = z.object({
	scope: z
		.enum(["drill", "question", "ask", "discuss"])
		.default("discuss")
		.describe(
			"Kind of interaction: 'drill' (follow-up), 'question' (single pick), 'ask' (free text) or 'discuss'.",
		),
	question: z.string().describe("The question to show the user"),
	options: z.array(optionSchema).optional().describe("Preset answers the user can pick"),
	allowCustom: z.boolean().default(true).describe("Offer a free-text answer as well"),
});

/** The label the browser shows for the free-text branch. */
const CUSTOM_LABEL = "Type something.";

type Scope = z.infer<typeof paramsSchema>["scope"];

/** What the transcript keeps, so a later reader sees the question and the answer. */
type Details = {
	scope: Scope;
	question: string;
	options: string[];
	answer: string | null;
	wasCustom?: boolean;
	index?: number;
};

type Answer = Pick<Details, "answer" | "wasCustom" | "index">;

/**
 * Ask, using only dialogs the browser can answer. An empty option list goes
 * straight to free text; cancelling either dialog is an answer of `null`.
 */
const ask = async (
	ctx: ExtensionToolContext,
	question: string,
	labels: string[],
	allowCustom: boolean,
): Promise<Answer> => {
	if (labels.length === 0) {
		const typed = await ctx.ui.input(question, "Type your answer");
		return { answer: typed ?? null, wasCustom: true };
	}
	const picked = await ctx.ui.select(question, allowCustom ? [...labels, CUSTOM_LABEL] : labels);
	if (picked === undefined) return { answer: null, wasCustom: false };
	if (picked !== CUSTOM_LABEL) {
		return { answer: picked, wasCustom: false, index: labels.indexOf(picked) + 1 };
	}
	const typed = await ctx.ui.input(question, "Type your answer");
	return { answer: typed ?? null, wasCustom: true };
};

const text = (message: string) => ({ content: [{ type: "text" as const, text: message }] });

export const discussExtension = (pi: ExtensionAPI): void => {
	pi.registerTool({
		name: "discuss",
		label: "Discuss",
		description:
			"Ask the user a question and return their answer. Use it to clarify requirements, confirm a decision, drill into a detail, or let the user pick or write an answer, instead of guessing or stalling.",
		promptSnippet: "Ask the user a question in the dashboard and return the answer",
		promptGuidelines: [
			"Use discuss whenever you need the user to clarify, confirm, pick, or write an answer before proceeding.",
			"Pass a few realistic options; the user can always write their own answer instead.",
		],
		parameters: z.toJSONSchema(paramsSchema, { io: "input" }),
		executionMode: "sequential",
		async execute(
			_toolCallId,
			raw,
			_signal,
			_onUpdate,
			ctx,
		): Promise<{ content: { type: "text"; text: string }[]; details: Details }> {
			const parsed = paramsSchema.safeParse(raw);
			if (!parsed.success) {
				return {
					...text(`Error: ${parsed.error.message}`),
					details: {
						scope: "discuss",
						question: "",
						options: [],
						answer: null,
					},
				};
			}
			const { scope, question, options, allowCustom } = parsed.data;
			const labels = (options ?? []).map((option) => option.label);
			const answered = await ask(ctx, question, labels, allowCustom || labels.length === 0);
			const details: Details = { scope, question, options: labels, ...answered };
			if (answered.answer === null) {
				return { ...text("User cancelled the discussion."), details };
			}
			return {
				...text(
					answered.wasCustom
						? `User wrote: ${answered.answer}`
						: `User selected: ${answered.index}. ${answered.answer}`,
				),
				details,
			};
		},
	});
};
