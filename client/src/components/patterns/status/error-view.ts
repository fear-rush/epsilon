import { CircleAlertIcon, FileQuestionIcon, RefreshCwIcon, WifiOffIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { OFFLINE, RefusalError, StaleContractError } from "@/api/client";

import type { StatusTone } from "./status-tone";

/** What a pane says about a failed read. */
export type ErrorView = {
	tone: StatusTone;
	title: string;
	line: string;
	icon: LucideIcon;
};

/** The HTTP status a refusal carries when the thing asked for does not exist. */
const NOT_FOUND = 404;

/** Maps any error a query can throw to the one view a pane shows for it. */
export function errorView(error: Error): ErrorView {
	if (error.message === OFFLINE) {
		return {
			tone: "warning",
			title: "Server not reachable",
			line: "This page reconnects on its own.",
			icon: WifiOffIcon,
		};
	}
	if (error instanceof StaleContractError) {
		return {
			tone: "warning",
			title: "This page is out of date",
			line: "Reload to get the version that matches the server.",
			icon: RefreshCwIcon,
		};
	}
	if (error instanceof RefusalError && error.status === NOT_FOUND) {
		return {
			tone: "muted",
			title: "Not found",
			line: error.message,
			icon: FileQuestionIcon,
		};
	}
	if (error instanceof RefusalError) {
		return {
			tone: "destructive",
			title: "The server refused",
			line: error.message,
			icon: CircleAlertIcon,
		};
	}
	return {
		tone: "destructive",
		title: "Something went wrong",
		line: error.message,
		icon: CircleAlertIcon,
	};
}
