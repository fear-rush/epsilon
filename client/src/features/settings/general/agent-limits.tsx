/**
 * The agent-wide limits: when pi summarises, how often it retries, and which
 * models the pickers offer. `SettingsManager` writes the two switches and the
 * scope; the three numbers have no setter, so the server merges them into
 * `settings.json` (docs/DECISIONS.md, Configure in the dashboard).
 */
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { SettingsSnapshot } from "@/api/types";
import { setAgentLimits } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Notice } from "@/components/patterns/status/notice";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { useSettingsRefresh } from "@/features/settings/queries";

type Limits = SettingsSnapshot["agent"];
type Scope = SettingsSnapshot["modelScope"];

type Draft = {
	compactionEnabled: boolean;
	reserveTokens: string;
	keepRecentTokens: string;
	retryEnabled: boolean;
	maxRetries: string;
	enabledModels: string;
};

const draftOf = (limits: Limits): Draft => ({
	compactionEnabled: limits.compactionEnabled,
	reserveTokens: String(limits.compactionReserveTokens),
	keepRecentTokens: String(limits.compactionKeepRecentTokens),
	retryEnabled: limits.retryEnabled,
	maxRetries: String(limits.retryMaxRetries),
	enabledModels: (limits.enabledModels ?? []).join(", "),
});

/** A blank or malformed count is a refusal, never a zero. */
const countOf = (value: string): number | undefined => {
	const trimmed = value.trim();
	if (!/^\d+$/u.test(trimmed)) return undefined;
	return Number(trimmed);
};

/** `--models` patterns are separated by a comma or a newline; none means every model. */
const patternsOf = (value: string): string[] | null => {
	const patterns = value
		.split(/[,\n]/u)
		.map((part) => part.trim())
		.filter((part) => part !== "");
	return patterns.length === 0 ? null : patterns;
};

export function AgentLimitsForm({ limits, scope }: { limits: Limits; scope: Scope }) {
	const refresh = useSettingsRefresh();
	const [draft, setDraft] = useState<Draft>(() => draftOf(limits));
	const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
	const save = useMutation({ mutationFn: setAgentLimits, onSuccess: refresh });

	const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) =>
		setDraft((current) => ({ ...current, [key]: value }));

	const submit = () => {
		const reserve = countOf(draft.reserveTokens);
		const keep = countOf(draft.keepRecentTokens);
		const retries = countOf(draft.maxRetries);
		const nextErrors = {
			reserveTokens: reserve === undefined ? "Use a whole number of tokens." : undefined,
			keepRecentTokens: keep === undefined ? "Use a whole number of tokens." : undefined,
			maxRetries: retries === undefined ? "Use a whole number of attempts." : undefined,
		};
		setErrors(nextErrors);
		if (reserve === undefined || keep === undefined || retries === undefined) return;
		save.mutate({
			compactionEnabled: draft.compactionEnabled,
			compactionReserveTokens: reserve,
			compactionKeepRecentTokens: keep,
			retryEnabled: draft.retryEnabled,
			retryMaxRetries: retries,
			enabledModels: patternsOf(draft.enabledModels),
		});
	};

	const quiet = save.isPending;

	return (
		<Section
			title="Agent limits"
			description="These apply to every chat in this agent home. A project's own settings file can still override them for that folder."
		>
			<Row
				stacked
				title="Automatic compaction"
				description="Summarise the context when it nears the window."
			>
				<Switch
					checked={draft.compactionEnabled}
					disabled={quiet}
					onCheckedChange={(checked) => set("compactionEnabled", checked)}
				/>
			</Row>
			<Row
				stacked
				title="Tokens kept below the window"
				description="Free context left before compaction starts."
			>
				<Field data-invalid={errors.reserveTokens !== undefined}>
					<FieldLabel htmlFor="compaction-reserve">Reserve tokens</FieldLabel>
					<Input
						id="compaction-reserve"
						inputMode="numeric"
						value={draft.reserveTokens}
						disabled={quiet}
						onChange={(event) => set("reserveTokens", event.target.value)}
					/>
					{errors.reserveTokens !== undefined && <FieldError>{errors.reserveTokens}</FieldError>}
				</Field>
			</Row>
			<Row
				stacked
				title="Recent tokens kept"
				description="History left unsummarised after a compaction."
			>
				<Field data-invalid={errors.keepRecentTokens !== undefined}>
					<FieldLabel htmlFor="compaction-keep">Keep recent tokens</FieldLabel>
					<Input
						id="compaction-keep"
						inputMode="numeric"
						value={draft.keepRecentTokens}
						disabled={quiet}
						onChange={(event) => set("keepRecentTokens", event.target.value)}
					/>
					{errors.keepRecentTokens !== undefined && (
						<FieldError>{errors.keepRecentTokens}</FieldError>
					)}
				</Field>
			</Row>
			<Row
				stacked
				title="Automatic retry"
				description="Try again after a transient provider failure."
			>
				<Switch
					checked={draft.retryEnabled}
					disabled={quiet}
					onCheckedChange={(checked) => set("retryEnabled", checked)}
				/>
			</Row>
			<Row stacked title="Retry attempts" description="Tries after the first request fails.">
				<Field data-invalid={errors.maxRetries !== undefined}>
					<FieldLabel htmlFor="retry-attempts">Max retries</FieldLabel>
					<Input
						id="retry-attempts"
						inputMode="numeric"
						value={draft.maxRetries}
						disabled={quiet}
						onChange={(event) => set("maxRetries", event.target.value)}
					/>
					{errors.maxRetries !== undefined && <FieldError>{errors.maxRetries}</FieldError>}
				</Field>
			</Row>
			<Row
				stacked
				title="Model scope"
				description={`pi's model patterns, the same syntax as --models (for example "openai/*" or "anthropic/claude-*"). Empty offers every model. ${scope.matched} of ${scope.available} models match now.`}
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="enabled-models">Enabled models</FieldLabel>
						<Input
							id="enabled-models"
							value={draft.enabledModels}
							disabled={quiet}
							placeholder="openai/*, anthropic/claude-*"
							onChange={(event) => set("enabledModels", event.target.value)}
						/>
						<FieldDescription>
							A chat keeps the model it is already using, even when the scope excludes it.
						</FieldDescription>
					</Field>
					{scope.diagnostics.length > 0 && (
						<Notice tone="warning">{scope.diagnostics.join("\n")}</Notice>
					)}
				</FieldGroup>
			</Row>
			<Row title="Save these limits" description="Every live chat reloads once they are written.">
				<Button variant="outline" disabled={quiet} onClick={submit}>
					Save
				</Button>
			</Row>
			{save.error !== null && <Notice tone="error">{save.error.message}</Notice>}
		</Section>
	);
}
