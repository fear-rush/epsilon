import { useMutation } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { removeTemplatePath } from "@/api/endpoints";
import type { TemplatePathInput } from "@/api/types";
import { Tip } from "@/components/patterns/tip";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSettingsProject, useSettingsRefresh, useTemplates } from "@/features/settings/queries";
import { sourceLine, TEMPLATE_KIND } from "./template-kind";
import { TemplatePathDialog } from "./template-path-dialog";

/**
 * One kind's path list, then the entries pi resolved from it. A path is removed by
 * the exact text the list shows, so an override entry can be removed too. The
 * entries are pi's answer: a file it excludes shows as disabled rather than gone.
 */
export function TemplateCard({
	kind,
	scope,
}: {
	kind: TemplatePathInput["kind"];
	scope: TemplatePathInput["scope"];
}) {
	const query = useTemplates(kind, scope);
	const label = TEMPLATE_KIND[kind];
	const project = useSettingsProject();
	const refresh = useSettingsRefresh();
	const [adding, setAdding] = useState(false);
	const remove = useMutation({
		mutationFn: (path: string) => removeTemplatePath(project, { kind, scope, path }),
		onSuccess: () => refresh(),
	});

	if (query.isPending)
		return <LoadingState label={`Reading ${label.entriesTitle.toLowerCase()}…`} />;
	if (query.error !== null) return <StatusView {...errorView(query.error)} />;

	return (
		<>
			<Section title={label.pathsTitle} description={label.pathsNote}>
				{query.data.paths.length === 0 ? (
					<p className="pad-row text-body text-muted-foreground">No path added.</p>
				) : (
					query.data.paths.map((path) => (
						<Row key={path} title={path}>
							<Tip label="Remove path">
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`Remove ${path}`}
									disabled={remove.isPending}
									onClick={() => {
										remove.reset();
										remove.mutate(path);
									}}
								>
									<Trash2Icon />
								</Button>
							</Tip>
						</Row>
					))
				)}
				<div className="pad-row">
					<Button type="button" variant="outline" onClick={() => setAdding(true)}>
						<PlusIcon />
						Add path
					</Button>
				</div>
			</Section>
			{remove.error !== null && (
				<Notice tone="error" title="The path was not removed">
					{remove.error.message}
				</Notice>
			)}
			<Section title={label.entriesTitle} description={label.entriesNote}>
				{query.data.entries.length === 0 ? (
					<p className="pad-row text-body text-muted-foreground">None in this scope.</p>
				) : (
					query.data.entries.map((entry) => (
						<Row key={entry.path} title={entry.name} description={sourceLine(entry)}>
							{!entry.enabled && <Badge variant="outline">Disabled</Badge>}
						</Row>
					))
				)}
			</Section>
			<TemplatePathDialog open={adding} onOpenChange={setAdding} kind={kind} scope={scope} />
		</>
	);
}
