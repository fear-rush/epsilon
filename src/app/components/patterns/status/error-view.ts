import { CircleAlertIcon, FileQuestionIcon, RefreshCwIcon, WifiOffIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageOutOfDate, ServerUnreachable } from "@/core/errors";

import type { Tone } from "./status-tone";

/** What a pane says about a failed read. */
export type ErrorView = {
	tone: Tone;
	title: string;
	line: string;
	icon: LucideIcon;
};

/**
 * Maps any error a query can throw to the one view a pane shows for it.
 *
 * The connection's own two failures have their own sentences, because they are the ones a
 * reader can act on: a page from an older build needs a reload, a closed socket needs a
 * moment. Everything else is the answer the feature named, in its own words.
 */
export function errorView(error: Error): ErrorView {
	if (error instanceof PageOutOfDate) {
		return {
			tone: "warning",
			title: "This page is out of date",
			line: "Reload to get the version that matches the server.",
			icon: RefreshCwIcon,
		};
	}
	if (error instanceof ServerUnreachable) {
		return {
			tone: "warning",
			title: "Server not reachable",
			line: "This page reconnects on its own.",
			icon: WifiOffIcon,
		};
	}
	return {
		tone: "danger",
		title: "Could not read this",
		line: error.message,
		icon: CircleAlertIcon,
	};
}

/** The view for something that is not there, which is an answer rather than a failure. */
export const notFoundView = (what: string): ErrorView => ({
	tone: "neutral",
	title: `${what} not found`,
	line: "It may have been removed since this page was opened.",
	icon: FileQuestionIcon,
});
