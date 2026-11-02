import { useMutation } from "@tanstack/react-query";
import { modelKey } from "shared";

import { Badge } from "@/components/ui/badge";
import { setDefaultModel } from "@/api/endpoints";
import { useSettings, useSettingsRefresh } from "@/features/settings/queries";
import { ModelPicker } from "./model-picker";
import { SettingsForm } from "./settings-form";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import type { SettingsSnapshot } from "@/api/types";

/**
 * General: whether Epsilon can run a turn, where its home is, which model a new
 * session starts on, and every setting the dashboard can change.
 */
export function SettingsGeneral() {
	const query = useSettings();
	return (
		<DetailPage title="General">
			{query.isPending ? (
				<LoadingState label="Reading the agent home…" />
			) : query.error !== null ? (
				<StatusView {...errorView(query.error)} />
			) : (
				<GeneralBody snapshot={query.data} />
			)}
		</DetailPage>
	);
}

/**
 * pi records a settings file it could not load and ignores it. The page names the
 * file next to the home it belongs to, so pi's fallback is never mistaken for the
 * operator's choice.
 */
function SettingsProblems({ snapshot }: { snapshot: SettingsSnapshot }) {
	return (
		<Notice tone="error" title="pi could not load a settings file">
			<ul className="grid gap-1">
				{snapshot.settingsProblems.map((problem) => (
					<li key={`${problem.scope}:${problem.path ?? ""}`}>
						<code>{problem.path ?? `${problem.scope} settings`}</code>: {problem.message}
					</li>
				))}
			</ul>
			<p>pi ignores that file until it parses.</p>
		</Notice>
	);
}

function GeneralBody({ snapshot }: { snapshot: SettingsSnapshot }) {
	const refresh = useSettingsRefresh();
	const defaults = useMutation({ mutationFn: setDefaultModel, onSuccess: refresh });
	const current = snapshot.defaultModel;
	const selected =
		current === null ? "" : modelKey({ provider: current.provider, id: current.modelId });
	const models = [...snapshot.models].sort((left, right) =>
		`${left.provider}/${left.name}`.localeCompare(`${right.provider}/${right.name}`),
	);

	return (
		<div className="grid gap-section">
			{snapshot.error !== undefined && <Notice tone="error">{snapshot.error}</Notice>}
			{snapshot.settingsProblems.length > 0 && <SettingsProblems snapshot={snapshot} />}
			<Section title="App">
				<Row
					title="Status"
					description={
						snapshot.ready
							? `${models.length} models can run a turn.`
							: "No provider can run a turn yet."
					}
				>
					<Badge variant={snapshot.ready ? "secondary" : "warning"}>
						{snapshot.ready ? "Ready" : "Not configured"}
					</Badge>
				</Row>
				<Row stacked title="Agent home">
					<code className="w-full rounded-md bg-muted pad-item text-code break-all">
						{snapshot.home}
					</code>
				</Row>
				<Row
					stacked
					title="Sessions"
					description={
						snapshot.sessions.source === null
							? "pi's default layout: one folder per project under this root."
							: `Set in ${snapshot.sessions.source}.`
					}
				>
					<code className="w-full rounded-md bg-muted pad-item text-code break-all">
						{snapshot.sessions.dir}
					</code>
				</Row>
				<Row
					stacked
					title="Default model"
					description={current === null ? "No default set." : undefined}
				>
					<ModelPicker
						id="default-model"
						models={models}
						selected={selected}
						disabled={defaults.isPending || models.length === 0}
						onPick={(model) => defaults.mutate({ provider: model.provider, modelId: model.id })}
					/>
				</Row>
			</Section>
			<SettingsForm snapshot={snapshot} />
			{defaults.error !== null && <Notice tone="error">{defaults.error.message}</Notice>}
		</div>
	);
}
