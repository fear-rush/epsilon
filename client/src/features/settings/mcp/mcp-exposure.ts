/**
 * The four exposures pi reads, written once and in short words: the server-level
 * control and the per-tool rule rows both map this list, so a label cannot say
 * one thing in two places. The values are pi's own; only the words are ours.
 */
import type { McpExposure } from "shared";

export const exposureItems: { value: McpExposure; label: string }[] = [
	{ value: "direct", label: "Direct" },
	{ value: "codemode", label: "Through code" },
	{ value: "deferred", label: "On request" },
	{ value: "hidden", label: "Hidden" },
];

export const exposureLabel = (exposure: McpExposure): string =>
	exposureItems.find((item) => item.value === exposure)?.label ?? exposure;
