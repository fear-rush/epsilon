import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { DetailPage } from "@/components/patterns/pane/detail-page";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";

import { SKILLS_BACK } from "./skill-modes";

/** A skill page with a centred state in place of the form: reading, not found, failed. */
export function SkillStatusPage({ title = "", children }: { title?: string; children: ReactNode }) {
	return (
		<DetailPage title={title} back={SKILLS_BACK} fill>
			{children}
		</DetailPage>
	);
}

/**
 * Reads one skill for a page and draws the states that are not the page: reading
 * and a failed read. Once there is data, `children` draws the page.
 */
export function SkillReader<Detail>({
	query,
	title,
	children,
}: {
	query: UseQueryResult<Detail>;
	title?: string;
	children: (detail: Detail) => ReactNode;
}) {
	if (query.isPending) {
		return (
			<SkillStatusPage title={title}>
				<div className="flex h-full items-center justify-center">
					<LoadingState label="Reading the skill…" />
				</div>
			</SkillStatusPage>
		);
	}
	if (query.error !== null) {
		return (
			<SkillStatusPage title={title}>
				<StatusView {...errorView(query.error)} />
			</SkillStatusPage>
		);
	}
	if (query.data === undefined) return null;
	return children(query.data);
}
