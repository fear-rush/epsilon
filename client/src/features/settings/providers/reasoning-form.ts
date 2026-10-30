/**
 * The reasoning form state and the map/compat it serializes. Kept out of the
 * component file so fast refresh sees a components-only module.
 */
import type { ProviderApi, ProviderModelInput, ReasoningCompat, ThinkingLevel } from "shared";

import { THINKING_LEVELS, compatForApi } from "./reasoning";

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
