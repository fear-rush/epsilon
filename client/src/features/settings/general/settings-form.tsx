/**
 * The settings page, grouped: every row is one key from the read, drawn with the
 * control the catalog names, and written straight through pi's own setter. A
 * terminal-only key sits in one closed card, read-only and with the sentence
 * saying why, so pi's surface stays discoverable without pretending it applies.
 */
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";

import { saveSetting } from "@/api/endpoints";
import type { SettingsSnapshot } from "@/api/types";
import { CollapsibleSection } from "@/components/patterns/section/collapsible-section";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { Notice } from "@/components/patterns/status/notice";
import { useSettingsRefresh } from "@/features/settings/queries";
import {
	BooleanControl,
	CompactionOverridesControl,
	LevelsControl,
	ModelsControl,
	NumberControl,
	SelectControl,
	TextControl,
	WarningsControl,
} from "./setting-controls";
import type { ReadRow, SettingValue } from "./setting-controls";
import { settingGroups, terminalEntries } from "./settings-catalog";
import type { SettingEntry, TerminalEntry } from "./settings-catalog";

/** A value as one line, for a key the panel only reports. */
const valueText = (value: SettingValue): string => {
	const parsed = z
		.union([
			z.string(),
			z.number().transform((number) => String(number)),
			z.boolean().transform((on) => (on ? "on" : "off")),
			z.null().transform(() => "pi's default"),
			z.array(z.string()).transform((items) => items.join(", ")),
		])
		.safeParse(value);
	return parsed.success ? parsed.data : JSON.stringify(value);
};

export function SettingsForm({ snapshot }: { snapshot: SettingsSnapshot }) {
	const refresh = useSettingsRefresh();
	const save = useMutation({ mutationFn: saveSetting, onSuccess: refresh });
	const rows = new Map(snapshot.settings.map((row) => [row.key, row]));
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
							snapshot={snapshot}
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
			{save.error !== null && <Notice tone="error">{save.error.message}</Notice>}
		</>
	);
}

function ControlRow({
	entry,
	row,
	snapshot,
	disabled,
	onChange,
}: {
	entry: SettingEntry;
	row: ReadRow | undefined;
	snapshot: SettingsSnapshot;
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
				snapshot={snapshot}
				disabled={disabled || overridden}
				onChange={(value) => onChange(entry.key, value)}
			/>
		</Row>
	);
}

function Control({
	entry,
	row,
	snapshot,
	disabled,
	onChange,
}: {
	entry: SettingEntry;
	row: ReadRow;
	snapshot: SettingsSnapshot;
	disabled: boolean;
	onChange: (value: SettingValue) => void;
}) {
	if (row.error !== undefined) {
		return <span className="text-meta text-destructive">{row.error}</span>;
	}
	const valueOf = (key: string) => snapshot.settings.find((setting) => setting.key === key)?.value;
	const seedOf = (key: string): number | undefined => {
		const parsed = z.number().safeParse(valueOf(key));
		return parsed.success ? parsed.data : undefined;
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
				<LevelsControl
					models={snapshot.models}
					value={row.value}
					disabled={disabled}
					onChange={onChange}
				/>
			);
		case "models":
			return (
				<ModelsControl
					value={row.value}
					scope={snapshot.modelScope}
					disabled={disabled}
					onChange={onChange}
				/>
			);
		case "compactionOverrides":
			return (
				<CompactionOverridesControl
					models={snapshot.models}
					seeds={{
						reserveTokens: seedOf("compaction.reserveTokens"),
						keepRecentTokens: seedOf("compaction.keepRecentTokens"),
					}}
					value={row.value}
					disabled={disabled}
					onChange={onChange}
				/>
			);
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
