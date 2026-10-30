import type { ComponentType } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import type { SettingsSnapshot } from "@/api/types";
import { useSettings } from "@/features/settings/queries";

/**
 * The one shape a settings section page has: read the snapshot, handle loading,
 * error and empty, then render one section with it. The section is passed as a
 * component, not called as a function, so its hooks get their own fiber when the
 * tab changes.
 */
export function SettingsPage({
	content: Content,
}: {
	content: ComponentType<{ snapshot: SettingsSnapshot }>;
}) {
	const query = useSettings();
	if (query.isPending) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
				<Spinner />
				Reading the agent home…
			</div>
		);
	}
	if (query.error !== null) {
		return (
			<div className="p-5 sm:p-8">
				<Alert variant="destructive">
					<AlertDescription>{query.error.message}</AlertDescription>
				</Alert>
			</div>
		);
	}
	if (query.data === undefined) return null;
	return (
		<div className="flex h-full min-h-0 flex-col">
			{query.data.error !== undefined && (
				<div className="shrink-0 px-5 pt-5 sm:px-8">
					<Alert variant="destructive">
						<AlertDescription className="max-h-40 overflow-auto whitespace-pre-wrap">
							{query.data.error}
						</AlertDescription>
					</Alert>
				</div>
			)}
			<div className="min-h-0 flex-1 overflow-y-auto">
				<Content snapshot={query.data} />
			</div>
		</div>
	);
}
