import type { ProviderApi, ThinkingLevel } from "shared";

import type { ReasoningCompat, ProviderModelInput } from "@/api/types";

/**
 * Shared reasoning vocabulary. A model's `thinkingLevelMap` decides which pi
 * levels exist; `compat` decides how the level travels. The compatibility keys
 * belong to one API family, so switching the family drops the keys it cannot
 * use while unknown compat keys survive for the writer.
 */

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

/**
 * The reasoning form state and the map/compat it serializes. Kept out of the
 * component file so fast refresh sees a components-only module.
 */

export type LevelRow = { offered: boolean; value: string };

export type ReasoningForm = {
	levels: Record<ThinkingLevel, LevelRow>;
	compat: ReasoningCompat;
};

export const defaultsFor = (level: ThinkingLevel): boolean => level !== "xhigh" && level !== "max";

export const reasoningFormOf = (model: ProviderModelInput | undefined): ReasoningForm => {
	const map = model?.thinkingLevelMap;
	const row = (level: ThinkingLevel): LevelRow => {
		const mapped = map?.[level];
		return {
			offered: mapped === undefined ? defaultsFor(level) : mapped !== null,
			value: mapped === null || mapped === undefined ? "" : mapped,
		};
	};
	const levels: Record<ThinkingLevel, LevelRow> = {
		off: row("off"),
		minimal: row("minimal"),
		low: row("low"),
		medium: row("medium"),
		high: row("high"),
		xhigh: row("xhigh"),
		max: row("max"),
	};
	return { levels, compat: model?.compat ?? {} };
};

/** The map and compat the save writes. Unsupported levels are explicit nulls. */
export const reasoningOf = (form: ReasoningForm, api: ProviderApi | undefined) => {
	const map: NonNullable<ProviderModelInput["thinkingLevelMap"]> = {};
	for (const level of THINKING_LEVELS) {
		const row = form.levels[level];
		if (!row.offered) map[level] = null;
		else if (row.value.trim() !== "") map[level] = row.value.trim();
		else if (level === "xhigh" || level === "max") map[level] = level;
	}
	const compat = compatForApi(form.compat, api);
	return {
		thinkingLevelMap: Object.keys(map).length === 0 ? undefined : map,
		compat: Object.keys(compat).length === 0 ? undefined : compat,
	};
};
