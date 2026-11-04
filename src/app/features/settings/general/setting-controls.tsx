import { Option, Schema } from "effect";
/**
 * One control per value shape, each parsing what the read reported before it draws.
 * A hand-edited value pi accepts but the panel cannot show says so instead of
 * rendering blank. Text and number fields keep a draft and write on blur or Enter,
 * so one write is one gesture; switches and selects write immediately.
 */
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { ThinkingLevel } from "#protocol/conversation/session";
import type { ThinkingLevel as ThinkingLevelType } from "#protocol/conversation/session";
import type { SettingValue as ReadSettingValue, SettingView } from "#protocol/settings/general";
import type { ProviderModelView } from "#protocol/settings/providers";
import { EnabledSwitch } from "@/components/patterns/enabled-switch";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

import { ModelPicker } from "./model-picker";
import { thinkingOptions } from "./settings-catalog";
import type { SettingOption } from "./settings-catalog";

/** One row of the settings read. */
export type ReadRow = SettingView;
export type SettingValue = ReadSettingValue;
type SnapshotModel = ProviderModelView;

/** The value a new per-model override starts at until the operator picks another. */
const NEW_OVERRIDE_LEVEL: ThinkingLevelType = "medium";

/** The model address the settings file keys an override by. */
const addressOf = (model: SnapshotModel): string => `${model.provider}/${model.id}`;

/** A zod-shaped reader over one decoder, so the controls below stay as they were. */
const reader = <A,>(decode: (value: SettingValue) => Option.Option<A>) => ({
	parse: (value: SettingValue): A => {
		const decoded = decode(value);
		if (Option.isNone(decoded)) throw new Error("The value could not be read.");
		return decoded.value;
	},
	safeParse: (
		value: SettingValue,
	): { readonly success: true; readonly data: A } | { readonly success: false } => {
		const decoded = decode(value);
		return Option.isSome(decoded) ? { data: decoded.value, success: true } : { success: false };
	},
});

const booleanValue = reader((value) => Schema.decodeUnknownOption(Schema.Boolean)(value));
const textValue = reader((value) =>
	Schema.decodeUnknownOption(Schema.NullOr(Schema.String))(value),
);
const numberValue = reader((value) => Schema.decodeUnknownOption(Schema.Finite)(value));
const warningsValue = reader((value) =>
	Schema.decodeUnknownOption(
		Schema.Struct({ anthropicExtraUsage: Schema.optional(Schema.Boolean) }),
	)(value),
);
const levelsValue = reader((value) =>
	Schema.decodeUnknownOption(Schema.Record(Schema.String, ThinkingLevel))(value),
);
const modelsValue = reader((value) =>
	Schema.decodeUnknownOption(Schema.NullOr(Schema.Array(Schema.NonEmptyString)))(value),
);
const compactionOverridesValue = reader((value) =>
	Schema.decodeUnknownOption(
		Schema.Record(
			Schema.String,
			Schema.Struct({
				keepRecentTokens: Schema.optional(Schema.Finite),
				reserveTokens: Schema.optional(Schema.Finite),
			}),
		),
	)(value),
);

/** One entry of `compaction.modelOverrides`. */
type CompactionOverride = {
	reserveTokens?: number | undefined;
	keepRecentTokens?: number | undefined;
};

/** A value the panel cannot draw, said out loud instead of shown as blank. */
function UnreadableValue({ value }: { value: SettingValue }) {
	return (
		<FieldError>{`pi holds ${JSON.stringify(value)}, which this panel cannot show.`}</FieldError>
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
	placeholder?: string | undefined;
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
	footer,
	onCommit,
}: {
	label: string;
	placeholder?: string | undefined;
	initial: string;
	inputMode?: "numeric";
	disabled: boolean;
	/** Extra lines inside the field, such as a count or a warning. */
	footer?: ReactNode;
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
			{footer}
		</Field>
	);
}

export function ModelsControl({
	value,
	scope,
	disabled,
	onChange,
}: {
	value: SettingValue;
	/** pi's own answer for what the patterns match, when the read carries it. */
	scope:
		| {
				readonly matched: number;
				readonly available: number;
				readonly diagnostics: ReadonlyArray<string>;
		  }
		| undefined;
	disabled: boolean;
	onChange: (value: SettingValue) => void;
}) {
	const parsed = modelsValue.safeParse(value);
	if (!parsed.success) return <UnreadableValue value={value} />;
	const initial = (parsed.data ?? []).join(", ");
	return (
		<DraftInput
			key={initial}
			label="Enabled models"
			placeholder="openai/*, anthropic/claude-*"
			initial={initial}
			disabled={disabled}
			footer={
				scope === undefined ? undefined : (
					<>
						<FieldDescription>{`${scope.matched} of ${scope.available} models match now.`}</FieldDescription>
						{scope.diagnostics.length > 0 && (
							<Notice tone="warning">{scope.diagnostics.join("\n")}</Notice>
						)}
					</>
				)
			}
			onCommit={(draft) => {
				const patterns = draft
					.split(/[,\n]/u)
					.map((part) => part.trim())
					.filter((part) => part !== "");
				onChange(patterns.length === 0 ? null : patterns);
			}}
		/>
	);
}

/** A blank count means "use the number above"; a malformed one is a refusal. */
const numberOrBlank = (draft: string): number | null | undefined => {
	const trimmed = draft.trim();
	if (trimmed === "") return null;
	if (!/^\d+$/u.test(trimmed)) return undefined;
	return Number(trimmed);
};

export function CompactionOverridesControl({
	models,
	seeds,
	value,
	disabled,
	onChange,
}: {
	models: readonly SnapshotModel[];
	/** The agent's own numbers, which a new override starts at. */
	seeds: CompactionOverride;
	value: SettingValue;
	disabled: boolean;
	/** Writes one model's override; a null field follows the agent's number. */
	onChange: (value: SettingValue) => void;
}) {
	const parsed = compactionOverridesValue.safeParse(value);
	if (!parsed.success) return <UnreadableValue value={value} />;
	const entries = Object.entries(parsed.data).toSorted(([left], [right]) =>
		left.localeCompare(right),
	);
	const seeded = seeds.reserveTokens !== undefined && seeds.keepRecentTokens !== undefined;
	return (
		<div className="grid gap-2">
			{entries.map(([modelKey, override]) => (
				<CompactionOverrideRow
					key={modelKey}
					modelKey={modelKey}
					override={override}
					disabled={disabled}
					onChange={onChange}
				/>
			))}
			{seeded ? (
				<AddCompactionOverride
					models={models}
					seeds={seeds}
					disabled={disabled}
					onChange={onChange}
				/>
			) : (
				<p className="text-meta text-muted-foreground">
					Fix the agent&apos;s own reserves before adding a per-model override.
				</p>
			)}
		</div>
	);
}

function CompactionOverrideRow({
	modelKey: key,
	override,
	disabled,
	onChange,
}: {
	/** pi's override key, `provider/modelId`. */
	modelKey: string;
	override: CompactionOverride;
	disabled: boolean;
	onChange: (value: SettingValue) => void;
}) {
	const write = (reserveTokens: number | null, keepRecentTokens: number | null) =>
		onChange({ modelKey: key, reserveTokens, keepRecentTokens });
	const reserve = override.reserveTokens;
	const keep = override.keepRecentTokens;
	return (
		<div className="grid gap-2 rounded-lg border pad-item">
			<div className="flex items-center justify-between gap-2">
				<span className="min-w-0 truncate text-meta">{key}</span>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={`Remove the override for ${key}`}
					disabled={disabled}
					onClick={() => write(null, null)}
				>
					<Trash2Icon />
				</Button>
			</div>
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">
					<DraftInput
						key={reserve === undefined ? "" : String(reserve)}
						label={`Reserve tokens for ${key}`}
						placeholder="Reserve"
						initial={reserve === undefined ? "" : String(reserve)}
						disabled={disabled}
						onCommit={(draft) => {
							const next = numberOrBlank(draft);
							if (next === undefined) return false;
							write(next, keep ?? null);
							return true;
						}}
					/>
				</div>
				<div className="min-w-0 flex-1">
					<DraftInput
						key={keep === undefined ? "" : String(keep)}
						label={`Recent tokens for ${key}`}
						placeholder="Keep recent"
						initial={keep === undefined ? "" : String(keep)}
						disabled={disabled}
						onCommit={(draft) => {
							const next = numberOrBlank(draft);
							if (next === undefined) return false;
							write(reserve ?? null, next);
							return true;
						}}
					/>
				</div>
			</div>
		</div>
	);
}

function AddCompactionOverride({
	models,
	seeds,
	disabled,
	onChange,
}: {
	models: readonly SnapshotModel[];
	seeds: CompactionOverride;
	disabled: boolean;
	onChange: (value: SettingValue) => void;
}) {
	const [model, setModel] = useState<SnapshotModel | undefined>();
	return (
		<div className="flex items-center gap-2">
			<div className="min-w-0 flex-1">
				<ModelPicker
					id="compaction-override-model"
					models={models}
					selected={model === undefined ? "" : addressOf(model)}
					label="Model to override"
					emptyText="Pick a model…"
					disabled={disabled}
					onPick={setModel}
				/>
			</div>
			<Button
				type="button"
				variant="outline"
				disabled={disabled || model === undefined}
				onClick={() => {
					if (model === undefined) return;
					if (seeds.reserveTokens === undefined || seeds.keepRecentTokens === undefined) return;
					onChange({
						modelKey: addressOf(model),
						reserveTokens: seeds.reserveTokens,
						keepRecentTokens: seeds.keepRecentTokens,
					});
					setModel(undefined);
				}}
			>
				Add
			</Button>
		</div>
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
	const overrides = Object.entries(parsed.data).toSorted(([left], [right]) =>
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
				if (option !== undefined) onChange(Schema.decodeUnknownSync(ThinkingLevel)(option.value));
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
					selected={model === undefined ? "" : addressOf(model)}
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
