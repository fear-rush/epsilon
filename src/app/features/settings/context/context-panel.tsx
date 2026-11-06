/**
 * The left side of the Context page: the Global or project tab, then the sections of
 * what steers the model in that folder. The page is read-only, so the list only says
 * which answer it is showing: pi's live answer for an open chat, or what the files say.
 */
import { useQuery } from "@tanstack/react-query";
import { useMatchRoute } from "@tanstack/react-router";

import { ListGroup } from "@/components/patterns/list/list-group";
import { ListItem } from "@/components/patterns/list/list-item";
import { MasterDetail } from "@/components/patterns/pane/master-detail";
import { Notice } from "@/components/patterns/status/notice";
import { ListPane } from "@/features/settings/shell/list-pane";

import { contextQuery, useSettingsProject } from "../queries.ts";
import { CONTEXT_SECTIONS, contextSection } from "./context-sections.ts";
import type { ContextSectionId } from "./context-sections.ts";

function ContextPanel({ selected }: { selected: ContextSectionId | undefined }) {
	const project = useSettingsProject();
	const context = useQuery(contextQuery(project));
	const view = context.data;
	const settingsProblems = (view?.problems ?? []).filter((problem) => problem.kind === "settings");

	return (
		<ListPane
			title="Context"
			count={view === undefined ? 0 : CONTEXT_SECTIONS.length}
			scope="/settings/context"
			notices={
				view === undefined ? undefined : (
					<>
						{view.live ? undefined : (
							<Notice tone="info">
								No chat is open in this folder, so this is what its files say. The exact prompt, the
								tool list and an extension&apos;s load errors appear once a chat opens there.
							</Notice>
						)}
						{settingsProblems.length === 0 ? undefined : (
							<Notice tone="danger">
								{settingsProblems.map((problem) => problem.message).join("\n")}
							</Notice>
						)}
					</>
				)
			}
			// The sections are fixed, so this pane searches nothing; the band shows the scope.
			query=""
			onQueryChange={() => undefined}
			searchLabel="Search context"
			pending={context.isPending}
			pendingLabel="Reading context…"
			error={context.error}
			empty={undefined}
		>
			{view === undefined ? undefined : (
				<ListGroup>
					{CONTEXT_SECTIONS.map((section) => (
						<ListItem
							key={section.id}
							name={section.label}
							description={section.line(view)}
							selected={selected === section.id}
							dimmed={section.count(view) === 0}
							link={{
								to: "/settings/context/$section",
								params: { section: section.id },
								search: true,
							}}
						/>
					))}
				</ListGroup>
			)}
		</ListPane>
	);
}

/** The route owns which section is selected; the panel only draws it. */
export function ContextLayout() {
	const matchRoute = useMatchRoute();
	const matched = matchRoute({ to: "/settings/context/$section" });
	// The route's own path segment is checked against the sections this page draws; an
	// unknown one renders the section page's not-found state.
	const selected = matched === false ? undefined : contextSection(matched.section)?.id;
	return (
		<MasterDetail editing={selected !== undefined} list={<ContextPanel selected={selected} />} />
	);
}
