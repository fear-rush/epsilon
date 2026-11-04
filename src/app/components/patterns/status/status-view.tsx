import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { errorView } from "./error-view";
import { toneText } from "./status-tone";
import type { Tone } from "./status-tone";

type StatusViewProps =
	| { error: Error; title?: string; action?: ReactNode }
	| {
			error?: undefined;
			icon: LucideIcon;
			title: string;
			line?: string;
			tone?: Tone;
			action?: ReactNode;
	  };

/** What the view draws, whether it was named explicitly or translated from a failure. */
type ResolvedView = {
	icon: LucideIcon;
	title: string;
	line: string | undefined;
	tone: Tone;
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
	const view = viewOf(props);
	const Icon = view.icon;
	return (
		<div className="flex h-full min-h-0 animate-enter-fade flex-col items-center justify-center gap-3 p-6 text-center">
			<Icon className={toneText(view.tone, "size-6")} aria-hidden />
			<div className="grid max-w-sm gap-1">
				<p className="text-section">{view.title}</p>
				{view.line !== undefined && <p className="text-meta text-muted-foreground">{view.line}</p>}
			</div>
			{props.action}
		</div>
	);
}
