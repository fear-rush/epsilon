/**
 * One control per value shape, each parsing what the read reported before it draws.
 * A hand-edited value pi accepts but the panel cannot show says so instead of
 * rendering blank. Text and number fields keep a draft and write on blur or Enter,
 * so one write is one gesture; switches and selects write immediately.
 */
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { modelKey, thinkingLevelSchema } from "shared";
import type { SnapshotModel, ThinkingLevel } from "shared";
import { z } from "zod";

import type { SettingsSnapshot } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { EnabledSwitch } from "@/components/patterns/controls/enabled-switch";
import { ModelPicker } from "./model-picker";
import { thinkingOptions } from "./settings-catalog";
import type { SettingOption } from "./settings-catalog";

/** One row of the settings read, as the generated contract names it. */
export type ReadRow = SettingsSnapshot["settings"][number];
export type SettingValue = ReadRow["value"];

/** The value a new per-model override starts at until the operator picks another. */
const NEW_OVERRIDE_LEVEL: ThinkingLevel = "medium";

const booleanValue = z.boolean();
const textValue = z.string().nullable();
const numberValue = z.number();
const warningsValue = z.looseObject({ anthropicExtraUsage: z.boolean().optional() });
const levelsValue = z.record(z.string(), thinkingLevelSchema);

/** A value the panel cannot draw, said out loud instead of shown as blank. */
function UnreadableValue({ value }: { value: SettingValue }) {
	return (
		<span className="text-meta text-destructive">
			{`pi holds ${JSON.stringify(value)}, which this panel cannot show.`}
		</span>
	);
}

export function BooleanControl({
	label,
	value,
	disabled,
	onChange,
}: {
	label: string;
	value: SettingValue;
	disabled: boolean;
	onChange: (value: SettingValue) => void;
}) {
	const parsed = booleanValue.safeParse(value);
	if (!parsed.success) return <UnreadableValue value={value} />;
	return (
		<EnabledSwitch
			checked={parsed.data}
			disabled={disabled}
			label={label}
			onCheckedChange={onChange}
		/>
	);
}

export function SelectControl({
	label,
	options,
	value,
	disabled,
	onChange,
}: {
	label: string;
	options: readonly SettingOption[];
	value: SettingValue;
	disabled: boolean;
	onChange: (value: SettingValue) => void;
}) {
	const parsed = textValue.safeParse(value);
	const picked = parsed.success ? parsed.data : undefined;
	if (picked === null || picked === undefined || !options.some((item) => item.value === picked)) {
		return <UnreadableValue value={value} />;
	}
	return (
		<Select
			items={options}
			value={picked}
			disabled={disabled}
			onValueChange={(next) => {
				const option = options.find((item) => item.value === next);
				if (option !== undefined) onChange(option.value);
			}}
		>
			<SelectTrigger aria-label={label} className="w-56 shrink-0">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

export function TextControl({
	label,
	placeholder,
	value,
	disabled,
	onChange,
}: {
	label: string;
	placeholder?: string;
	value: SettingValue;
	disabled: boolean;
	onChange: (value: SettingValue) => void;
}) {
	const parsed = textValue.safeParse(value);
	if (!parsed.success) return <UnreadableValue value={value} />;
	const initial = parsed.data ?? "";
	return (
		<DraftInput
			key={initial}
			label={label}
			placeholder={placeholder}
			initial={initial}
			disabled={disabled}
			onCommit={(draft) => onChange(draft === "" ? null : draft)}
		/>
	);
}

export function NumberControl({
	label,
	value,
	disabled,
	onChange,
}: {
	label: string;
	value: SettingValue;
	disabled: boolean;
	onChange: (value: SettingValue) => void;
}) {
	const parsed = numberValue.safeParse(value);
	if (!parsed.success) return <UnreadableValue value={value} />;
	return (
		<DraftInput
			key={parsed.data}
			label={label}
			initial={String(parsed.data)}
			inputMode="numeric"
			disabled={disabled}
			onCommit={(draft) => {
				// A blank or malformed count is a refusal, never a zero.
				if (!/^\d+$/u.test(draft.trim())) return false;
				onChange(Number(draft.trim()));
				return true;
			}}
		/>
	);
}

/**
 * A field that writes on blur or Enter. `onCommit` answers whether the draft was a
 * value, so a malformed one keeps its text and shows why.
 */
function DraftInput({
	label,
	placeholder,
	initial,
	inputMode,
	disabled,
	onCommit,
}: {
	label: string;
	placeholder?: string;
	initial: string;
	inputMode?: "numeric";
	disabled: boolean;
	onCommit: (draft: string) => boolean | void;
}) {
	const [draft, setDraft] = useState(initial);
	const [error, setError] = useState<string | undefined>();
	const commit = () => {
		if (draft === initial) return;
		const accepted = onCommit(draft);
		if (accepted === false) setError("Use a whole number.");
		else setError(undefined);
	};
	return (
		<Field data-invalid={error !== undefined}>
			<Input
				aria-label={label}
				placeholder={placeholder}
				inputMode={inputMode}
				value={draft}
				disabled={disabled}
				aria-invalid={error !== undefined}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") event.currentTarget.blur();
				}}
			/>
			{error !== undefined && <FieldError>{error}</FieldError>}
		</Field>
	);
}

export function WarningsControl({
	label,
	value,
	disabled,
	onChange,
}: {
	label: string;
	value: SettingValue;
	disabled: boolean;
	onChange: (value: SettingValue) => void;
}) {
	const parsed = warningsValue.safeParse(value);
	if (!parsed.success) return <UnreadableValue value={value} />;
	// pi warns unless the key is exactly false, so an absent key is on.
	return (
		<EnabledSwitch
			checked={parsed.data.anthropicExtraUsage !== false}
			disabled={disabled}
			label={label}
			onCheckedChange={(next) => onChange({ ...parsed.data, anthropicExtraUsage: next })}
		/>
	);
}

export function LevelsControl({
	models,
	value,
	disabled,
	onChange,
}: {
	models: readonly SnapshotModel[];
	value: SettingValue;
	disabled: boolean;
	/** Writes one override; `level: null` removes it. */
	onChange: (value: SettingValue) => void;
}) {
	const parsed = levelsValue.safeParse(value);
	if (!parsed.success) return <UnreadableValue value={value} />;
	const overrides = Object.entries(parsed.data).sort(([left], [right]) =>
		left.localeCompare(right),
	);
	return (
		<div className="grid gap-2">
			{overrides.map(([key, level]) => {
				const at = key.indexOf("/");
				const provider = key.slice(0, at);
				const modelId = key.slice(at + 1);
				return (
					<div key={key} className="flex items-center gap-2">
						<span className="min-w-0 flex-1 truncate text-meta">{key}</span>
						<LevelSelect
							label={`Thinking level for ${key}`}
							value={level}
							disabled={disabled}
							onChange={(next) => onChange({ provider, modelId, level: next })}
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={`Remove the override for ${key}`}
							disabled={disabled}
							onClick={() => onChange({ provider, modelId, level: null })}
						>
							<Trash2Icon />
						</Button>
					</div>
				);
			})}
			<AddOverride
				models={models}
				disabled={disabled}
				onAdd={(model, level) => onChange({ provider: model.provider, modelId: model.id, level })}
			/>
		</div>
	);
}

function LevelSelect({
	label,
	value,
	disabled,
	onChange,
}: {
	label: string;
	value: ThinkingLevel;
	disabled: boolean;
	onChange: (level: ThinkingLevel) => void;
}) {
	return (
		<Select
			items={thinkingOptions}
			value={value}
			disabled={disabled}
			onValueChange={(next) => {
				const option = thinkingOptions.find((item) => item.value === next);
				if (option !== undefined) onChange(thinkingLevelSchema.parse(option.value));
			}}
		>
			<SelectTrigger aria-label={label} className="w-32 shrink-0">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{thinkingOptions.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

function AddOverride({
	models,
	disabled,
	onAdd,
}: {
	models: readonly SnapshotModel[];
	disabled: boolean;
	onAdd: (model: SnapshotModel, level: ThinkingLevel) => void;
}) {
	const [model, setModel] = useState<SnapshotModel | undefined>();
	const [level, setLevel] = useState<ThinkingLevel>(NEW_OVERRIDE_LEVEL);
	return (
		<div className="flex items-center gap-2">
			<div className="min-w-0 flex-1">
				<ModelPicker
					id="thinking-override-model"
					models={models}
					selected={model === undefined ? "" : modelKey(model)}
					label="Model to override"
					emptyText="Pick a model…"
					disabled={disabled}
					onPick={setModel}
				/>
			</div>
			<LevelSelect
				label="Thinking level for the new override"
				value={level}
				disabled={disabled}
				onChange={setLevel}
			/>
			<Button
				type="button"
				variant="outline"
				disabled={disabled || model === undefined}
				onClick={() => {
					if (model === undefined) return;
					onAdd(model, level);
					setModel(undefined);
				}}
			>
				Add
			</Button>
		</div>
	);
}
