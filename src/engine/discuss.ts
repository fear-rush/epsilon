import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Epsilon's ask-user tool: one `discuss` call, a question, optional preset answers and a
 * free-text path.
 *
 * Only dialogs the page can draw are used: the presets are `ctx.ui.select`, and "Type
 * something." opens `ctx.ui.input`. The engine's UI bridge turns both into dialog frames,
 * so every open tab sees the question and the first answer settles it for the run.
 *
 * pi's tool registry takes TypeBox schemas; this is pi's boundary, not the wire, which
 * stays Effect Schema.
 */

const Option = Type.Object({
	label: Type.String({ description: "Display label for the option" }),
	description: Type.Optional(
		Type.String({ description: "Optional one-line detail under the option" }),
	),
});

export const DiscussParams = Type.Object({
	scope: Type.Optional(
		Type.Union(
			[
				Type.Literal("drill"),
				Type.Literal("question"),
				Type.Literal("ask"),
				Type.Literal("discuss"),
			],
			{
				default: "discuss",
				description:
					"Kind of interaction: 'drill' (follow-up), 'question' (single pick), 'ask' (free text) or 'discuss'.",
			},
		),
	),
	question: Type.String({ description: "The question to show the user" }),
	options: Type.Optional(Type.Array(Option, { description: "Preset answers the user can pick" })),
	allowCustom: Type.Optional(
		Type.Boolean({
			default: true,
			description: "Offer a free-text answer as well",
		}),
	),
});
type DiscussParams = {
	readonly scope?: "drill" | "question" | "ask" | "discuss";
	readonly question: string;
	readonly options?: ReadonlyArray<{ readonly label: string; readonly description?: string }>;
	readonly allowCustom?: boolean;
};

/** The label the page shows for the free-text branch. */
const CUSTOM_LABEL = "Type something.";

type Details = {
	readonly scope: NonNullable<DiscussParams["scope"]>;
	readonly question: string;
	readonly options: ReadonlyArray<string>;
	readonly answer: string | null;
	readonly wasCustom?: boolean;
	readonly index?: number;
};

const text = (message: string) => ({ content: [{ text: message, type: "text" as const }] });

/**
 * Ask, using only dialogs the page can answer. An empty option list goes straight to free
 * text; cancelling either dialog is an answer of null.
 */
const ask = async (
	ctx: ExtensionToolContext,
	question: string,
	labels: ReadonlyArray<string>,
	allowCustom: boolean,
): Promise<Pick<Details, "answer" | "index" | "wasCustom">> => {
	if (labels.length === 0) {
		const typed = await ctx.ui.input(question, "Type your answer");
		return { answer: typed ?? null, wasCustom: true };
	}
	const picked = await ctx.ui.select(
		question,
		allowCustom ? [...labels, CUSTOM_LABEL] : [...labels],
	);
	if (picked === undefined) return { answer: null, wasCustom: false };
	if (picked !== CUSTOM_LABEL) {
		return { answer: picked, wasCustom: false, index: labels.indexOf(picked) + 1 };
	}
	const typed = await ctx.ui.input(question, "Type your answer");
	return { answer: typed ?? null, wasCustom: true };
};

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
		parameters: DiscussParams,
		executionMode: "sequential",
		async execute(_toolCallId, params: DiscussParams, _signal, _onUpdate, ctx) {
			const question = params.question;
			const labels = (params.options ?? []).map((option) => option.label);
			const allowCustom = params.allowCustom ?? labels.length === 0;
			const answered = await ask(ctx, question, labels, allowCustom);
			const details: Details = {
				options: labels,
				question,
				scope: params.scope ?? "discuss",
				...answered,
			};
			if (answered.answer === null) {
				return { ...text("User cancelled the discussion."), details };
			}
			return {
				...text(
					answered.wasCustom === true
						? `User wrote: ${answered.answer}`
						: `User selected: ${answered.index}. ${answered.answer}`,
				),
				details,
			};
		},
	});
};
