import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { errorView } from "./error-view";
import type { Tone } from "./status-tone";

/** Each tone's icon and the alert variant that paints it. */
const TONE = {
	neutral: { icon: InfoIcon, variant: "default" },
	info: { icon: InfoIcon, variant: "info" },
	success: { icon: CircleCheckIcon, variant: "success" },
	warning: { icon: TriangleAlertIcon, variant: "warning" },
	danger: { icon: CircleAlertIcon, variant: "destructive" },
} as const;

/**
 * An alert for something the user should read, with the icon its tone calls for.
 *
 * A failure comes through `error`, and the translator supplies its tone, icon and reason.
 * An explicit `title` still wins, for a section that names the action more precisely than
 * the error's tag can.
 */
export function Notice({
	error,
	tone = "neutral",
	title,
	action,
	children,
}: {
	error?: Error;
	tone?: Tone;
	title?: string;
	/** One button on the right, such as "Use pi's catalog". */
	action?: ReactNode;
	children?: ReactNode;
}) {
	const view = error === undefined ? undefined : errorView(error);
	const resolved = view?.tone ?? tone;
	const Icon = view?.icon ?? TONE[resolved].icon;
	const heading = title ?? view?.title;
	const body = view?.line ?? children;
	return (
		<Alert variant={TONE[resolved].variant}>
			<Icon />
			{heading !== undefined && <AlertTitle>{heading}</AlertTitle>}
			{body !== undefined && <AlertDescription>{body}</AlertDescription>}
			{action !== undefined && <AlertAction>{action}</AlertAction>}
		</Alert>
	);
}
