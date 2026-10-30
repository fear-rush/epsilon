/**
 * Shared reasoning vocabulary. A model's `thinkingLevelMap` decides which pi
 * levels exist; `compat` decides how the level travels. The compatibility keys
 * belong to one API family, so switching the family drops the keys it cannot
 * use while unknown compat keys survive for the writer.
 */
import type { ProviderApi, ReasoningCompat, ThinkingLevel } from "shared";

export const THINKING_LEVELS: readonly ThinkingLevel[] = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
	off: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra high",
	max: "Max",
};

const KNOWN_COMPAT_KEYS = [
	"thinkingFormat",
	"supportsReasoningEffort",
	"thinkingTokenBudgetField",
	"requiresReasoningContentOnAssistantMessages",
	"forceAdaptiveThinking",
] as const;

/** Keep only the reasoning compat a family understands, plus unknown keys. */
export const compatForApi = (
	compat: ReasoningCompat,
	api: ProviderApi | undefined,
): ReasoningCompat => {
	if (api === undefined || api === "google-generative-ai") {
		const next = { ...compat };
		for (const key of KNOWN_COMPAT_KEYS) delete next[key];
		return api === undefined ? compat : next;
	}
	const next = { ...compat };
	for (const key of KNOWN_COMPAT_KEYS) delete next[key];
	if (api === "anthropic-messages") {
		if (compat.forceAdaptiveThinking !== undefined) {
			next.forceAdaptiveThinking = compat.forceAdaptiveThinking;
		}
		return next;
	}
	if (compat.thinkingFormat !== undefined) next.thinkingFormat = compat.thinkingFormat;
	if (compat.supportsReasoningEffort !== undefined) {
		next.supportsReasoningEffort = compat.supportsReasoningEffort;
	}
	if (compat.thinkingTokenBudgetField !== undefined) {
		next.thinkingTokenBudgetField = compat.thinkingTokenBudgetField;
	}
	if (compat.requiresReasoningContentOnAssistantMessages !== undefined) {
		next.requiresReasoningContentOnAssistantMessages =
			compat.requiresReasoningContentOnAssistantMessages;
	}
	return next;
};
