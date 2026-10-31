import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** The alert tones, each with its own icon. */
export type NoticeTone = "error" | "warning" | "success" | "info";

const VARIANT = {
	error: "destructive",
	warning: "warning",
	success: "success",
	info: "info",
} as const;

const ICON = {
	error: CircleAlertIcon,
	warning: TriangleAlertIcon,
	success: CircleCheckIcon,
	info: InfoIcon,
} as const;

/** An alert for something the user should read, with the icon its tone calls for. */
export function Notice({
	tone,
	title,
	action,
	children,
}: {
	tone: NoticeTone;
	title?: string;
	/** One button on the right, such as "Use pi's catalog". */
	action?: ReactNode;
	children?: ReactNode;
}) {
	const Icon = ICON[tone];
	return (
		<Alert variant={VARIANT[tone]}>
			<Icon />
			{title !== undefined && <AlertTitle>{title}</AlertTitle>}
			{children !== undefined && <AlertDescription>{children}</AlertDescription>}
			{action !== undefined && <AlertAction>{action}</AlertAction>}
		</Alert>
	);
}
