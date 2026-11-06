import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

import { toneText } from "./status-tone";
import type { Tone } from "./status-tone";

/**
 * One bordered row above the composer: an icon or a spinner, words, an optional action.
 * Content with its own structure (a task, a terminal, a queue) goes in `children` instead
 * of `text`.
 */
export function StatusRow({
	icon: Icon,
	tone = "neutral",
	spinner = false,
	text,
	action,
	children,
	className,
}: {
	icon?: LucideIcon;
	tone?: Tone;
	spinner?: boolean;
	text?: ReactNode;
	action?: ReactNode;
	children?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex animate-enter-rise items-center gap-2 rounded-card border bg-background pad-item text-meta",
				className,
			)}
		>
			{spinner && <Spinner />}
			{!spinner && Icon !== undefined && (
				<Icon className={toneText(tone, "size-icon shrink-0")} aria-hidden />
			)}
			{text !== undefined && <span className="min-w-0 flex-1">{text}</span>}
			{children !== undefined && <div className="min-w-0 flex-1">{children}</div>}
			{action}
		</div>
	);
}
