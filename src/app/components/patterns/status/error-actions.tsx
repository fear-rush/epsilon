import { Link } from "@tanstack/react-router";

import { Button, buttonVariants } from "@/components/ui/button";

import type { ErrorAction } from "./error-view";

/** The buttons an error view asks for; "retry" does what the caller says it does. */
export function ErrorActions({
	actions,
	onRetry,
}: {
	actions: ReadonlyArray<ErrorAction> | undefined;
	onRetry?: (() => void) | undefined;
}) {
	if (actions === undefined || actions.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center justify-center gap-2">
			{actions.map((action) => {
				switch (action) {
					case "retry":
						return onRetry === undefined ? null : (
							<Button key={action} size="sm" variant="outline" onClick={onRetry}>
								Try again
							</Button>
						);
					case "diagnostics":
						return (
							<Link
								key={action}
								to="/settings/diagnostics"
								className={buttonVariants({ size: "sm", variant: "outline" })}
							>
								Diagnostics
							</Link>
						);
					case "reload":
						return (
							<Button
								key={action}
								size="sm"
								variant="outline"
								onClick={() => window.location.reload()}
							>
								Reload
							</Button>
						);
					default:
						return null;
				}
			})}
		</div>
	);
}
