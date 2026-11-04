import {
	CircleAlertIcon,
	CircleSlashIcon,
	CloudOffIcon,
	FileQuestionIcon,
	GaugeIcon,
	PackageXIcon,
	PlugZapIcon,
	RefreshCwIcon,
	ShieldAlertIcon,
	TimerOffIcon,
	UnplugIcon,
	WifiOffIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import * as protocol from "#protocol/errors";
import { LocalRefused, PageOutOfDate, ServerUnreachable } from "@/core/errors";

import type { Tone } from "./status-tone";

/** What a pane says about a failure: one tone, what did not happen, the reason, one icon. */
export type ErrorView = {
	tone: Tone;
	title: string;
	line: string;
	icon: LucideIcon;
};

/**
 * Every tagged error the wire can carry, derived from the protocol's own exports so a new
 * class joins this union without anyone remembering to list it.
 */
type ProtocolError = InstanceType<(typeof protocol)[keyof typeof protocol]>;

/** Whether `error` was decoded into one of the protocol's classes. */
const isProtocolError = (error: Error): error is ProtocolError =>
	Object.values(protocol).some((tagged) => error instanceof tagged);

/** The view for something that is missing, which is an answer rather than a failure. */
export const notFoundView = (what: string): ErrorView => ({
	tone: "neutral",
	title: `${what} not found`,
	line: "It may have been removed since this page was opened.",
	icon: FileQuestionIcon,
});

/** The compile-time proof that every tag has words: a tag without a case reaches `never`. */
const noWords = (error: never): ErrorView => {
	throw new Error(`no words for error tag "${String(error)}"`);
};

/** A failure nobody named: a bug, so it is said plainly and the detail stays in the log. */
const UNKNOWN: ErrorView = {
	tone: "danger",
	title: "Couldn't finish that",
	line: "This page met a problem it cannot explain. Try again, and open Diagnostics if it keeps happening.",
	icon: CircleAlertIcon,
};

/**
 * Maps any error a query or command can throw to the one view its surface shows.
 *
 * A new tagged error in `src/protocol/errors.ts` joins the union, so it does not
 * type-check until this switch has a case for it. The line is pi's reason when pi gave
 * one, then what the reader can do; the connection's own failures have their own
 * sentences, because those are the ones they can act on.
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
	if (error instanceof LocalRefused) {
		return {
			tone: "danger",
			title: "Couldn't read that",
			line: error.reason,
			icon: CircleAlertIcon,
		};
	}
	if (!isProtocolError(error)) return UNKNOWN;

	switch (error._tag) {
		case "SessionNotFound":
			return notFoundView("Session");
		case "SessionRunning":
			return {
				tone: "warning",
				title: "The chat is still open",
				line: "Close it before moving, copying or deleting it.",
				icon: CircleSlashIcon,
			};
		case "EngineStopped":
			return {
				tone: "warning",
				title: "The chat's engine stopped",
				line: "Your next message starts a new one from the session file.",
				icon: UnplugIcon,
			};
		case "CommandRefused":
			return {
				tone: "danger",
				title: "The chat couldn't do that",
				line: error.reason,
				icon: CircleAlertIcon,
			};
		case "EngineLimitReached":
			return {
				tone: "warning",
				title: "Every chat engine is busy",
				line: `${error.running} of ${error.max} are running a turn. Close an idle chat or raise the limit in Settings.`,
				icon: GaugeIcon,
			};
		case "EngineCrashLoop":
			return {
				tone: "danger",
				title: "This chat keeps stopping",
				line: "It crashed three times in a minute, so Epsilon stopped restarting it. Open Diagnostics for the reason.",
				icon: CircleAlertIcon,
			};
		case "FileUnreadable":
			return {
				tone: "danger",
				title: "Couldn't read a file",
				line: error.reason,
				icon: CircleAlertIcon,
			};
		case "FileUnwritable":
			return {
				tone: "danger",
				title: "Couldn't save a file",
				line: error.reason,
				icon: CircleAlertIcon,
			};
		case "SettingRefused":
			return {
				tone: "danger",
				title: "Couldn't save the setting",
				line: error.reason,
				icon: CircleAlertIcon,
			};
		case "ProviderRefused":
			return {
				tone: "danger",
				title: "Couldn't save the provider",
				line: error.reason,
				icon: CircleAlertIcon,
			};
		case "McpRefused":
			return {
				tone: "danger",
				title: "Couldn't change the MCP server",
				line: error.subject === undefined ? error.reason : `${error.subject}: ${error.reason}`,
				icon: CircleAlertIcon,
			};
		case "RegistryUnavailable":
			return {
				tone: "warning",
				title: "Couldn't reach the MCP registry",
				line: `${error.reason} Try again in a moment.`,
				icon: CloudOffIcon,
			};
		case "RegistryNotFound":
			return {
				tone: "neutral",
				title: "MCP server not found",
				line: `The registry has no entry named "${error.server}".`,
				icon: FileQuestionIcon,
			};
		case "StageGone":
			return {
				tone: "warning",
				title: "The import expired",
				line: "Epsilon discarded the staged files. Start the import again.",
				icon: TimerOffIcon,
			};
		case "SkillRefused":
			return {
				tone: "danger",
				title: "Couldn't change the skill",
				line: error.reason,
				icon: CircleAlertIcon,
			};
		case "ProjectRefused":
			return {
				tone: "danger",
				title: "Couldn't open the project",
				line: error.reason,
				icon: CircleAlertIcon,
			};
		case "ProjectNotTrusted":
			return {
				tone: "warning",
				title: "This project is not trusted",
				line: `Trust ${error.path} before pi loads its resources or runs in it.`,
				icon: ShieldAlertIcon,
			};
		case "PackageFailed":
			return {
				tone: "danger",
				title: "Couldn't change the packages",
				line: error.source === undefined ? error.reason : `${error.source}: ${error.reason}`,
				icon: PackageXIcon,
			};
		case "ImportFailed":
			return {
				tone: "danger",
				title: "Couldn't import the skills",
				line: error.source === undefined ? error.reason : `${error.source}: ${error.reason}`,
				icon: CircleAlertIcon,
			};
		case "HandshakeRefused":
			return {
				tone: "warning",
				title: "This page cannot use the server",
				line: "Reload to try again.",
				icon: PlugZapIcon,
			};
		default:
			return noWords(error);
	}
}
