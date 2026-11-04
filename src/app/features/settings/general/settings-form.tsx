/**
 * The settings page, grouped: every row is one key from the read, drawn with the control
 * the catalog names, and written straight through pi's own setter. A terminal-only key
 * sits in one closed card, read-only and with the sentence saying why, so pi's surface
 * stays discoverable without pretending it applies.
 */
import { useMutation } from "@tanstack/react-query";
import { Schema } from "effect";

import type { SettingValue, SettingView } from "#protocol/settings/general";
import type { ProviderModelView } from "#protocol/settings/providers";
import { CollapsibleSection } from "@/components/patterns/section/collapsible-section";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { Notice } from "@/components/patterns/status/notice";
import { FieldError } from "@/components/ui/field";
import { call } from "@/core/runtime";

import { useSettingsRefresh } from "../queries.ts";
import {
	BooleanControl,
	CompactionOverridesControl,
	LevelsControl,
	ModelsControl,
	NumberControl,
	SelectControl,
	TextControl,
	WarningsControl,
} from "./setting-controls.tsx";
import type { ReadRow } from "./setting-controls.tsx";
import { settingGroups, terminalEntries } from "./settings-catalog.ts";
import type { SettingEntry, TerminalEntry } from "./settings-catalog.ts";

/** The two reads this form needs: pi's rows, and the models its pickers list. */
export type SettingsRead = {
	readonly models: ReadonlyArray<ProviderModelView>;
	readonly settings: ReadonlyArray<SettingView>;
};

/** A value as one line, for a key the panel only reports. */
const valueText = (value: SettingValue): string => {
	if (value === null) return "pi's default";
	if (Schema.is(Schema.String)(value)) return value;
	if (Schema.is(Schema.Finite)(value)) return String(value);
	if (Schema.is(Schema.Boolean)(value)) return value ? "on" : "off";
	if (Schema.is(Schema.Array(Schema.String))(value)) return value.join(", ");
	return JSON.stringify(value);
};

export function SettingsForm({ models, settings }: SettingsRead) {
	const refresh = useSettingsRefresh();
	const save = useMutation({
		mutationFn: (input: { key: string; value: SettingValue }) =>
			call((client) => client["settings.general.writeSetting"](input)),
		onSuccess: refresh,
	});
	const rows = new Map(settings.map((row) => [row.key, row]));
	const write = (key: string, value: SettingValue) => save.mutate({ key, value });

	return (
		<>
			{settingGroups.map((group) => (
				<Section key={group.title} title={group.title} description={group.description}>
					{group.entries.map((entry) => (
						<ControlRow
							key={entry.key}
							entry={entry}
							row={rows.get(entry.key)}
							models={models}
							settings={settings}
							disabled={save.isPending}
							onChange={write}
						/>
					))}
				</Section>
			))}
			<CollapsibleSection
				title="Terminal-only settings"
				description="Values that only mean something in pi's terminal interface. This page reports them and never writes them."
			>
				<Section>
					{terminalEntries.map((entry) => (
						<TerminalRow key={entry.key} entry={entry} row={rows.get(entry.key)} />
					))}
				</Section>
			</CollapsibleSection>
			{save.error !== null && <Notice error={save.error} />}
		</>
	);
}

function ControlRow({
	entry,
	row,
	models,
	settings,
	disabled,
	onChange,
}: {
	entry: SettingEntry;
	row: ReadRow | undefined;
	models: ReadonlyArray<ProviderModelView>;
	settings: ReadonlyArray<SettingView>;
	disabled: boolean;
	onChange: (key: string, value: SettingValue) => void;
}) {
	if (row === undefined) {
		return (
			<Notice tone="warning">{`${entry.label} is missing from this server's settings read.`}</Notice>
		);
	}
	// A project's file wins over the home's, and this panel only writes the home.
	const overridden = row.scope === "project";
	const stacked =
		entry.control.kind === "text" ||
		entry.control.kind === "number" ||
		entry.control.kind === "levels";
	return (
		<Row
			title={entry.label}
			description={
				overridden
					? `${entry.description} This project's .pi/settings.json sets it, so the panel leaves it alone.`
					: entry.description
			}
			stacked={stacked}
		>
			<Control
				entry={entry}
				row={row}
				models={models}
				settings={settings}
				disabled={disabled || overridden}
				onChange={(value) => onChange(entry.key, value)}
			/>
		</Row>
	);
}

function Control({
	entry,
	row,
	models,
	settings,
	disabled,
	onChange,
}: {
	entry: SettingEntry;
	row: ReadRow;
	models: ReadonlyArray<ProviderModelView>;
	settings: ReadonlyArray<SettingView>;
	disabled: boolean;
	onChange: (value: SettingValue) => void;
}) {
	if (row.error !== undefined) {
		return <FieldError>{row.error}</FieldError>;
	}
	const seedOf = (key: string): number | undefined => {
		const value = settings.find((setting) => setting.key === key)?.value;
		return value !== null && value !== undefined && Schema.is(Schema.Finite)(value)
			? value
			: undefined;
	};
	const control = entry.control;
	switch (control.kind) {
		case "switch":
			return (
				<BooleanControl
					label={entry.label}
					value={row.value}
					disabled={disabled}
					onChange={onChange}
				/>
			);
		case "select":
			return (
				<SelectControl
					label={entry.label}
					options={control.options}
					value={row.value}
					disabled={disabled}
					onChange={onChange}
				/>
			);
		case "text":
			return (
				<TextControl
					label={entry.label}
					placeholder={control.placeholder}
					value={row.value}
					disabled={disabled}
					onChange={onChange}
				/>
			);
		case "number":
			return (
				<NumberControl
					label={entry.label}
					value={row.value}
					disabled={disabled}
					onChange={onChange}
				/>
			);
		case "warnings":
			return (
				<WarningsControl
					label={entry.label}
					value={row.value}
					disabled={disabled}
					onChange={onChange}
				/>
			);
		case "levels":
			return (
				<LevelsControl models={models} value={row.value} disabled={disabled} onChange={onChange} />
			);
		case "models":
			return (
				<ModelsControl
					value={row.value}
					scope={undefined}
					disabled={disabled}
					onChange={onChange}
				/>
			);
		case "compactionOverrides":
			return (
				<CompactionOverridesControl
					models={models}
					seeds={{
						keepRecentTokens: seedOf("compaction.keepRecentTokens"),
						reserveTokens: seedOf("compaction.reserveTokens"),
					}}
					value={row.value}
					disabled={disabled}
					onChange={onChange}
				/>
			);
		default:
			return null;
	}
}

function TerminalRow({ entry, row }: { entry: TerminalEntry; row: ReadRow | undefined }) {
	return (
		<Row title={entry.label} description={entry.reason}>
			<span className="text-meta text-muted-foreground">
				{row === undefined ? "Not reported" : valueText(row.value)}
			</span>
		</Row>
	);
}
