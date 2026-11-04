import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { Tone } from "./status-tone";

/** Each tone's icon and the alert variant that paints it. */
const TONE = {
	neutral: { icon: InfoIcon, variant: "default" },
	info: { icon: InfoIcon, variant: "info" },
	success: { icon: CircleCheckIcon, variant: "success" },
	warning: { icon: TriangleAlertIcon, variant: "warning" },
	danger: { icon: CircleAlertIcon, variant: "destructive" },
} as const;

/** An alert for something the user should read, with the icon its tone calls for. */
export function Notice({
	tone,
	title,
	action,
	children,
}: {
	tone: Tone;
	title?: string;
	/** One button on the right, such as "Use pi's catalog". */
	action?: ReactNode;
	children?: ReactNode;
}) {
	const { icon: Icon, variant } = TONE[tone];
	return (
		<Alert variant={variant}>
			<Icon />
			{title !== undefined && <AlertTitle>{title}</AlertTitle>}
			{children !== undefined && <AlertDescription>{children}</AlertDescription>}
			{action !== undefined && <AlertAction>{action}</AlertAction>}
		</Alert>
	);
}
