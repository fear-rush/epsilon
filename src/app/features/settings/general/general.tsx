import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { SettingsProblem } from "#protocol/config/general";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { agentHomeQuery } from "@/queries";
import { call } from "@/runtime";

import { useModels, useSettings, useSettingsRefresh } from "../queries.ts";
import { ModelPicker } from "./model-picker.tsx";
import { SettingsForm } from "./settings-form.tsx";

/**
 * General: whether Epsilon can run a turn, where its home is, which model a new session
 * starts on, Epsilon's own knobs, and every pi setting the dashboard can change.
 */
export function SettingsGeneral() {
	const query = useSettings();
	const models = useModels();
	const home = useQuery(agentHomeQuery);

	if (query.isPending) {
		return (
			<DetailPage title="General">
				<LoadingState label="Reading the agent home…" />
			</DetailPage>
		);
	}
	if (query.error !== null) {
		return (
			<DetailPage title="General">
				<StatusView {...errorView(query.error)} />
			</DetailPage>
		);
	}

	const snapshot = query.data;
	const sorted = [...(models.data?.models ?? [])].toSorted((left, right) =>
		`${left.provider}/${left.name}`.localeCompare(`${right.provider}/${right.name}`),
	);

	return (
		<DetailPage title="General">
			<div className="grid gap-section">
				{snapshot.providers.error !== undefined && (
					<Notice tone="error">{snapshot.providers.error}</Notice>
				)}
				<SettingsProblems problems={snapshot.settings.problems} />
				<AppSection
					home={home.data}
					maxRunning={snapshot.epsilon.settings.maxRunning}
					models={sorted}
					ready={snapshot.readiness.ready}
					selected={
						snapshot.settings.defaultModel === null
							? ""
							: `${snapshot.settings.defaultModel.provider}/${snapshot.settings.defaultModel.modelId}`
					}
				/>
				<SettingsForm models={sorted} settings={snapshot.settings.rows} />
			</div>
		</DetailPage>
	);
}

/** pi records a settings file it could not load and ignores it; a default is never a choice. */
function SettingsProblems({ problems }: { problems: ReadonlyArray<SettingsProblem> }) {
	if (problems.length === 0) return null;
	return (
		<Notice tone="error" title="pi could not load a settings file">
			<ul className="grid gap-1">
				{problems.map((problem) => (
					<li key={`${problem.scope}:${problem.path ?? ""}`}>
						<code>{problem.path ?? `${problem.scope} settings`}</code>: {problem.message}
					</li>
				))}
			</ul>
			<p>pi ignores that file until it parses.</p>
		</Notice>
	);
}

function AppSection({
	home,
	maxRunning,
	models,
	ready,
	selected,
}: {
	home: string | undefined;
	maxRunning: number;
	models: ReadonlyArray<{ provider: string; id: string; name: string }>;
	ready: boolean;
	selected: string;
}) {
	const refresh = useSettingsRefresh();
	const defaults = useMutation({
		mutationFn: (input: { provider: string; modelId: string }) =>
			call((client) => client["config.general.setDefaultModel"](input)),
		onSuccess: refresh,
	});
	const engines = useMutation({
		mutationFn: (value: number) =>
			call((client) => client["config.general.setMaxRunning"]({ maxRunning: value })),
		onSuccess: refresh,
	});
	const [draft, setDraft] = useState(String(maxRunning));
	const commit = (): void => {
		const next = Number(draft.trim());
		if (Number.isInteger(next) && next > 0 && next !== maxRunning) engines.mutate(next);
		else setDraft(String(maxRunning));
	};

	return (
		<Section title="App">
			<Row
				title="Status"
				description={
					ready ? `${models.length} models can run a turn.` : "No provider can run a turn yet."
				}
			>
				<Badge variant={ready ? "secondary" : "warning"}>
					{ready ? "Ready" : "Not configured"}
				</Badge>
			</Row>
			<Row stacked title="Agent home">
				<code className="w-full rounded-md bg-muted pad-item text-code break-all">
					{home ?? "…"}
				</code>
			</Row>
			<Row
				stacked
				title="Default model"
				description={selected === "" ? "No default set." : undefined}
			>
				<ModelPicker
					id="default-model"
					models={models}
					selected={selected}
					disabled={defaults.isPending || models.length === 0}
					onPick={(model) => defaults.mutate({ modelId: model.id, provider: model.provider })}
				/>
			</Row>
			<Row
				title="Chat engines"
				description="How many chats may hold an engine at once; the registry evicts an idle one over this."
			>
				<Input
					aria-label="Chat engines"
					className="w-20"
					inputMode="numeric"
					value={draft}
					onBlur={commit}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") event.currentTarget.blur();
					}}
				/>
			</Row>
			{defaults.error !== null && (
				<Notice tone="error" title="The default model was not saved">
					{defaults.error.message}
				</Notice>
			)}
			{engines.error !== null && (
				<Notice tone="error" title="The engine count was not saved">
					{engines.error.message}
				</Notice>
			)}
		</Section>
	);
}
