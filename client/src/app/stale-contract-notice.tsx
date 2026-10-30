/**
 * The one notice for a page that is older than the server. It sits above every
 * route, Settings included, because a stale page can no longer trust the shapes
 * it reads.
 */
import { useStaleContract } from "@/api/stale-contract";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function StaleContractNotice() {
	if (!useStaleContract()) return null;
	return (
		<div className="fixed inset-x-0 top-0 z-50 flex justify-center p-3">
			<Alert variant="destructive" className="max-w-md bg-background">
				<AlertTitle>Version mismatch</AlertTitle>
				<AlertDescription>
					<p>This tab was loaded from a different build than the server speaks.</p>
					<Button variant="outline" onClick={() => window.location.reload()}>
						Reload
					</Button>
				</AlertDescription>
			</Alert>
		</div>
	);
}
