/**
 * What a page shows when a render throws. Without it the router's own screen is
 * the only thing between a bug and a blank page, and the product's language is
 * lost (AGENTS.md rule 7).
 */
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ErrorComponentProps } from "@tanstack/react-router";

export function RouteError({ error, reset }: ErrorComponentProps) {
	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<Alert variant="destructive" className="max-w-lg">
				<AlertTitle>This page stopped</AlertTitle>
				<AlertDescription>
					<p className="break-words whitespace-pre-wrap">
						{error instanceof Error ? error.message : String(error)}
					</p>
					<Button variant="outline" onClick={reset}>
						Try again
					</Button>
				</AlertDescription>
			</Alert>
		</div>
	);
}
