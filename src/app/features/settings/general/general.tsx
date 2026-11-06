import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { SessionDir, SettingsProblem } from "#protocol/settings/general";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { agentHomeQuery } from "@/core/queries";
import { call } from "@/core/runtime";

import { counted } from "../context/context-sections.ts";
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
			<DetailPage title="General" column>
				<LoadingState label="Reading the agent home…" />
			</DetailPage>
		);
	}
	if (query.error !== null) {
		return (
			<DetailPage title="General" column>
				<StatusView error={query.error} />
			</DetailPage>
		);
	}

	const snapshot = query.data;
	const sorted = [...(models.data?.models ?? [])].toSorted((left, right) =>
		`${left.provider}/${left.name}`.localeCompare(`${right.provider}/${right.name}`),
	);
	// "Can run a turn" is pi's question: a model of a provider with no credential cannot,
	// however many the catalog composes. The picker offers the ones that can, and the
	// Status row counts the same list.
	const configured = new Set(
		snapshot.providers.providers
			.filter((provider) => provider.auth.configured)
			.map((provider) => provider.id),
	);
	const usable = sorted.filter((model) => configured.has(model.provider));

	return (
		<DetailPage title="General" column>
			<div className="grid gap-section">
				{snapshot.providers.error !== undefined && (
					<Notice tone="danger">{snapshot.providers.error}</Notice>
				)}
				<SettingsProblems problems={snapshot.settings.problems} />
				<AppSection
					home={home.data}
					maxRunning={snapshot.epsilon.settings.maxRunning}
					models={usable}
					ready={snapshot.readiness.ready}
					sessions={snapshot.settings.sessions}
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
		<Notice tone="danger" title="pi could not load a settings file">
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
	sessions,
}: {
	home: string | undefined;
	maxRunning: number;
	models: ReadonlyArray<{ provider: string; id: string; name: string }>;
	ready: boolean;
	selected: string;
	/** pi's own answer for where this folder's sessions live, and what set it. */
	sessions: SessionDir;
}) {
	const refresh = useSettingsRefresh();
	const defaults = useMutation({
		mutationFn: (input: { provider: string; modelId: string }) =>
			call((client) => client["settings.general.setDefaultModel"](input)),
		onSuccess: refresh,
	});
	const engines = useMutation({
		mutationFn: (value: number) =>
			call((client) => client["settings.general.setMaxRunning"]({ maxRunning: value })),
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
					ready
						? `${counted(models.length, "model", "models")} can run a turn.`
						: "No provider can run a turn yet."
				}
			>
				<Badge variant={ready ? "secondary" : "warning"}>
					{ready ? "Ready" : "Not configured"}
				</Badge>
			</Row>
			<Row stacked title="Agent home">
				<code className="w-full rounded-chip bg-muted pad-item text-code break-all">
					{home ?? "…"}
				</code>
			</Row>
			<Row
				stacked
				title="Sessions"
				description={
					sessions.source === null
						? "pi's default layout: one folder per project under this root."
						: `Set in ${sessions.source}.`
				}
			>
				<code className="w-full rounded-chip bg-muted pad-item text-code break-all">
					{sessions.dir}
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
				description="Most chats open at once. The oldest idle one closes first."
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
				<Notice error={defaults.error} title="The default model was not saved" />
			)}
			{engines.error !== null && (
				<Notice error={engines.error} title="The engine count was not saved" />
			)}
		</Section>
	);
}
