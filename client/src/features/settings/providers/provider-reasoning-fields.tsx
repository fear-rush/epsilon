/**
 * The compatibility half of reasoning: how the level travels, not which levels
 * exist. Shown for the provider's default format and again inside the model
 * dialog, where a model override wins per key. Auto means pi detects it.
 */
import type { ProviderApi } from "shared";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ReasoningCompat } from "@/api/types";

const THINKING_FORMATS = [
	"openai",
	"openrouter",
	"deepseek",
	"together",
	"baseten",
	"zai",
	"qwen",
	"chat-template",
	"qwen-chat-template",
	"string-thinking",
	"ant-ling",
] as const;

const BUDGET_FIELDS = [
	"thinking_token_budget",
	"thinking_budget",
	"thinking_budget_tokens",
] as const;

const triValue = (value: boolean | undefined): "auto" | "yes" | "no" =>
	value === true ? "yes" : value === false ? "no" : "auto";

const triBoolean = (value: string): boolean | undefined =>
	value === "yes" ? true : value === "no" ? false : undefined;

const withKey = <Key extends keyof ReasoningCompat>(
	compat: ReasoningCompat,
	key: Key,
	value: ReasoningCompat[Key] | undefined,
): ReasoningCompat => {
	const next = { ...compat };
	if (value === undefined) delete next[key];
	else next[key] = value;
	return next;
};

const choices = (values: readonly string[], labels?: Record<string, string>) => [
	{ value: "auto", label: "Auto" },
	...values.map((value) => ({ value, label: labels?.[value] ?? value })),
];

function Choice({
	id,
	label,
	description,
	value,
	items,
	onChange,
}: {
	id: string;
	label: string;
	description: string;
	value: string;
	items: { value: string; label: string }[];
	onChange: (value: string) => void;
}) {
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Select
				items={items}
				value={value}
				onValueChange={(next) => {
					if (next !== null) onChange(next);
				}}
			>
				<SelectTrigger id={id} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{items.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			<FieldDescription>{description}</FieldDescription>
		</Field>
	);
}

export function ReasoningCompatFields({
	compat,
	api,
	idPrefix,
	onChange,
}: {
	compat: ReasoningCompat;
	api: ProviderApi | undefined;
	/** Keeps ids unique when the provider form and a model dialog are both open. */
	idPrefix: string;
	onChange: (compat: ReasoningCompat) => void;
}) {
	if (api === undefined) {
		return (
			<p className="text-sm text-muted-foreground">
				Choose an API family to set how it carries a reasoning level.
			</p>
		);
	}
	if (api === "google-generative-ai") {
		return (
			<p className="text-sm text-muted-foreground">
				Google chooses its thinking control from the model id. It needs no compatibility field here.
			</p>
		);
	}

	if (api === "anthropic-messages") {
		return (
			<Choice
				id={`${idPrefix}-compat-adaptive`}
				label="Adaptive thinking"
				description="Leave on Auto unless the gateway requires adaptive thinking for a newer Claude model."
				value={triValue(compat.forceAdaptiveThinking)}
				items={[
					{ value: "auto", label: "Auto" },
					{ value: "yes", label: "Require adaptive" },
					{ value: "no", label: "Never adaptive" },
				]}
				onChange={(value) => onChange(withKey(compat, "forceAdaptiveThinking", triBoolean(value)))}
			/>
		);
	}

	return (
		<div className="grid gap-3">
			<Choice
				id={`${idPrefix}-compat-format`}
				label="Reasoning format"
				description="Where the level goes in the request body. Auto follows the provider URL."
				value={compat.thinkingFormat ?? "auto"}
				items={choices(THINKING_FORMATS)}
				onChange={(value) =>
					onChange(
						withKey(
							compat,
							"thinkingFormat",
							// SAFETY: the select only offers values from THINKING_FORMATS.
							value === "auto" ? undefined : (value as ReasoningCompat["thinkingFormat"]),
						),
					)
				}
			/>
			<Choice
				id={`${idPrefix}-compat-effort`}
				label="Reasoning effort"
				description="Whether this endpoint accepts an effort value."
				value={triValue(compat.supportsReasoningEffort)}
				items={[
					{ value: "auto", label: "Auto" },
					{ value: "yes", label: "Sends effort" },
					{ value: "no", label: "No effort" },
				]}
				onChange={(value) =>
					onChange(withKey(compat, "supportsReasoningEffort", triBoolean(value)))
				}
			/>
			<Choice
				id={`${idPrefix}-compat-budget-field`}
				label="Token budget field"
				description="Caps reasoning tokens when this endpoint shares max_tokens with the answer."
				value={compat.thinkingTokenBudgetField ?? "auto"}
				items={choices(BUDGET_FIELDS)}
				// SAFETY: the select only offers values from BUDGET_FIELDS.
				onChange={(value) =>
					onChange(
						withKey(
							compat,
							"thinkingTokenBudgetField",
							value === "auto" ? undefined : (value as ReasoningCompat["thinkingTokenBudgetField"]),
						),
					)
				}
			/>
			<Choice
				id={`${idPrefix}-compat-reasoning-content`}
				label="Reasoning content"
				description="Whether the model needs its previous reasoning sent back with tool results."
				value={triValue(compat.requiresReasoningContentOnAssistantMessages)}
				items={[
					{ value: "auto", label: "Auto" },
					{ value: "yes", label: "Requires it" },
					{ value: "no", label: "Does not need it" },
				]}
				onChange={(value) =>
					onChange(
						withKey(compat, "requiresReasoningContentOnAssistantMessages", triBoolean(value)),
					)
				}
			/>
		</div>
	);
}
