import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon } from "lucide-react";

import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { PaneBody } from "@/components/patterns/pane/pane-body";
import { FieldStack } from "@/components/patterns/section/field-stack";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { errorView } from "@/components/patterns/status/error-view";
import { Notice } from "@/components/patterns/status/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { call } from "@/runtime";

/**
 * Settings → General.
 *
 * Two files, shown on one page and never merged: Epsilon's own knobs live in
 * `<home>/.epsilon/settings.json`, and pi's keys are read through pi's own resolution, so
 * the scope beside each row is what pi would use for a chat in this home.
 */

const epsilonQuery = {
	queryKey: ["config", "general", "epsilon"],
	queryFn: ({ signal }: { signal: AbortSignal }) =>
		call((client) => client["config.general.read"](), { signal }),
};

const piSettingsQuery = {
	queryKey: ["config", "general", "settings", null],
	queryFn: ({ signal }: { signal: AbortSignal }) =>
		call((client) => client["config.general.settings"]({ folder: null }), { signal }),
};

export function SettingsGeneral() {
	const epsilon = useQuery(epsilonQuery);
	const piSettings = useQuery(piSettingsQuery);

	return (
		<Pane className="flex-1">
			<PaneBar title="General" />
			<PaneBody page>
				{epsilon.error !== null && <Problem error={epsilon.error} />}
				{piSettings.error !== null && <Problem error={piSettings.error} />}

				<Section
					title="Epsilon"
					description="Kept in this dashboard's own settings file, never in pi's."
				>
					{epsilon.data === undefined ? (
						<Row title="Reading…" />
					) : (
						<>
							{epsilon.data.problems.map((problem) => (
								<Row
									key={problem.path ?? problem.message}
									title="A settings file Epsilon could not use"
									description={problem.message}
								>
									<Badge variant="warning">{problem.path ?? "no path"}</Badge>
								</Row>
							))}
							<MaxRunning value={epsilon.data.settings.maxRunning} />
						</>
					)}
				</Section>

				<Section
					title="pi settings"
					description="Resolved by pi: a project file wins over the home file, which wins over pi's default."
				>
					{piSettings.data === undefined ? (
						<Row title="Reading…" />
					) : (
						<>
							<Row title="Default model" description="What a new chat starts with.">
								<span className="text-body text-muted-foreground">
									{piSettings.data.defaultModel === null
										? "unset"
										: `${piSettings.data.defaultModel.provider} / ${piSettings.data.defaultModel.modelId}`}
								</span>
							</Row>
							{piSettings.data.problems.map((problem) => (
								<Row
									key={`${problem.scope}:${problem.path ?? problem.message}`}
									title={`pi could not load the ${problem.scope} settings file`}
									description={problem.message}
								/>
							))}
							{piSettings.data.rows.map((row) => (
								<Row
									key={row.key}
									title={row.key}
									description={row.error ?? "Set where the scope says."}
								>
									<code className="text-code text-muted-foreground">
										{row.value === null ? "unset" : JSON.stringify(row.value)}
									</code>
									<Badge variant="outline">{row.scope}</Badge>
									{row.terminalOnly && <Badge variant="ghost">terminal</Badge>}
								</Row>
							))}
						</>
					)}
				</Section>
			</PaneBody>
		</Pane>
	);
}

function Problem({ error }: { error: Error }) {
	const view = errorView(error);
	return (
		<Notice tone={view.tone === "destructive" ? "error" : "warning"} title={view.title}>
			{view.line}
		</Notice>
	);
}

function MaxRunning({ value }: { value: number }) {
	const queryClient = useQueryClient();
	const save = useMutation({
		mutationFn: (maxRunning: number) =>
			call((client) => client["config.general.setMaxRunning"]({ maxRunning })),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config"] }),
	});

	const submit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
		event.preventDefault();
		const raw = new FormData(event.currentTarget).get("maxRunning");
		if (raw === null) return;
		const maxRunning = Number(raw);
		if (!Number.isInteger(maxRunning) || maxRunning < 1) return;
		save.mutate(maxRunning);
	};

	return (
		<>
			<form onSubmit={submit}>
				<Section description="How many chats may run at once before an idle one is closed. A busy chat is never closed.">
					<FieldStack>
						<Field>
							<FieldLabel htmlFor="max-running">Running chats</FieldLabel>
							<div className="flex items-center gap-2">
								<Input
									id="max-running"
									name="maxRunning"
									type="number"
									min={1}
									defaultValue={value}
									className="w-24"
								/>
								<Button type="submit" size="sm" disabled={save.isPending}>
									Save
								</Button>
								{!save.isPending && save.isSuccess && (
									<span className="inline-flex items-center gap-1 text-meta text-muted-foreground">
										<CircleCheckIcon className="size-4" aria-hidden />
										Saved
									</span>
								)}
							</div>
							<FieldDescription>
								Epsilon closes the least recently used idle engine to stay under this.
							</FieldDescription>
						</Field>
					</FieldStack>
				</Section>
			</form>
			{save.error !== null && <Problem error={save.error} />}
		</>
	);
}
