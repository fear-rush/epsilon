import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ServerUnreachable } from "@/core/errors";

import { ErrorActions } from "./error-actions";
import { errorView } from "./error-view";
import type { ErrorAction } from "./error-view";
import { LoadingState } from "./loading-state";
import { toneText } from "./status-tone";
import type { Tone } from "./status-tone";

type StatusViewProps = (
	| { error: Error; title?: string; action?: ReactNode }
	| {
			error?: undefined;
			icon: LucideIcon;
			title: string;
			line?: string;
			tone?: Tone;
			action?: ReactNode;
			actions?: ReadonlyArray<ErrorAction>;
	  }
) & { onRetry?: () => void };

/** What the view draws, whether it was named explicitly or translated from a failure. */
type ResolvedView = {
	icon: LucideIcon;
	title: string;
	line: string | undefined;
	tone: Tone;
	actions?: ReadonlyArray<ErrorAction> | undefined;
};

/** A failure's words come from the translator; only a more precise title may override it. */
function viewOf(props: StatusViewProps): ResolvedView {
	if (props.error !== undefined) {
		const failure = errorView(props.error);
		return { ...failure, title: props.title ?? failure.title };
	}
	return {
		icon: props.icon,
		title: props.title,
		line: props.line,
		tone: props.tone ?? "neutral",
		actions: props.actions,
	};
}

/**
 * The one centred state of a pane: loading, empty, error, offline or not found.
 * An icon, a title, one line and an optional action.
 *
 * A failure comes through `error`: the translator decides its tone, words and icon, so a
 * pane never writes its own sentence about one.
 */
export function StatusView(props: StatusViewProps) {
	// A lost connection is the status strip's alone (FB-6): the pane keeps waiting.
	if (props.error instanceof ServerUnreachable) {
		return (
			<div className="flex h-full min-h-0 items-center justify-center p-6">
				<LoadingState label="Loading…" />
			</div>
		);
	}
	const view = viewOf(props);
	const Icon = view.icon;
	return (
		<div className="flex h-full min-h-0 animate-enter-fade flex-col items-center justify-center gap-3 p-6 text-center">
			<Icon className={toneText(view.tone, "size-icon-lg")} aria-hidden />
			<div className="grid max-w-sm gap-1">
				<p className="text-section">{view.title}</p>
				{view.line !== undefined && view.line !== "" && (
					<p className="text-meta text-muted-foreground">{view.line}</p>
				)}
			</div>
			<ErrorActions actions={view.actions} onRetry={props.onRetry} />
			{props.action}
		</div>
	);
}
