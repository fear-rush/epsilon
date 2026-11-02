import { DetailPage } from "@/components/patterns/pane/detail-page";
import { ProjectPicker, ScopeTabs } from "@/components/patterns/tabs/scope-tabs";
import { useSettingsProject } from "@/features/settings/queries";
import { TemplateCard } from "./template-card";
import { scopeOfProject } from "./template-kind";

/**
 * Prompt templates and themes: the path lists pi loads them from, and what pi
 * resolves out of them for the chosen scope. A theme is listed and never applied.
 */
export function SettingsTemplates() {
	const project = useSettingsProject();
	const scope = scopeOfProject(project);
	return (
		<DetailPage
			title="Templates"
			tabs={
				<div className="grid gap-2">
					<ScopeTabs section="/settings/templates" />
					<ProjectPicker section="/settings/templates" />
				</div>
			}
		>
			<TemplateCard kind="prompts" scope={scope} />
			<TemplateCard kind="themes" scope={scope} />
		</DetailPage>
	);
}
