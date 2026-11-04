import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { errorView } from "./error-view";
import { toneText } from "./status-tone";
import type { Tone } from "./status-tone";

type StatusViewProps = {
	action?: ReactNode;
} & (
	| { error: Error; icon?: LucideIcon; title?: string; line?: string; tone?: Tone }
	| { error?: undefined; icon: LucideIcon; title: string; line?: string; tone?: Tone }
);

/**
 * The one centred state of a pane: loading, empty, error, offline or not found.
 * An icon, a title, one line and an optional action.
 *
 * A failure comes through `error`: the translator decides its tone, words and icon, so a
 * pane never writes its own sentence about one.
 */
export function StatusView(props: StatusViewProps) {
	const view =
		props.error === undefined
			? { icon: props.icon, title: props.title, line: props.line, tone: props.tone }
			: errorView(props.error);
	const Icon = view.icon;
	const tone = view.tone ?? "neutral";
	return (
		<div className="flex h-full min-h-0 animate-enter-fade flex-col items-center justify-center gap-3 p-6 text-center">
			<Icon className={toneText(tone, "size-6")} aria-hidden />
			<div className="grid max-w-sm gap-1">
				<p className="text-section">{view.title}</p>
				{view.line !== undefined && <p className="text-meta text-muted-foreground">{view.line}</p>}
			</div>
			{props.action}
		</div>
	);
}
