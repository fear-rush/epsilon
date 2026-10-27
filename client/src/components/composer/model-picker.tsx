import type { SnapshotModel } from "shared";

/** A model's identity is the pair pi switches on; the name is only a label. */
const keyOf = (model: SnapshotModel): string => `${model.provider}/${model.id}`;

type ModelPickerProps = {
	models: SnapshotModel[];
	model: SnapshotModel | undefined;
	onSelect: (model: SnapshotModel) => void;
};

/** The current provider first, the rest alphabetically: most switches stay put. */
const providerOrder = (providers: string[], current: string | undefined): string[] =>
	[...providers].sort((a, b) => {
		if (a === current) return -1;
		if (b === current) return 1;
		return a.localeCompare(b);
	});

/**
 * A native select on purpose: pi offers every configured provider at once (510
 * models here), so the list is grouped by provider, and the phone gets its own
 * picker instead of a popup that covers the transcript.
 */
export function ModelPicker({ models, model, onSelect }: ModelPickerProps) {
	const current = model === undefined ? undefined : keyOf(model);
	const options =
		model !== undefined && !models.some((candidate) => keyOf(candidate) === current)
			? [model, ...models]
			: models;

	const groups = new Map<string, SnapshotModel[]>();
	for (const candidate of options) {
		groups.set(candidate.provider, [...(groups.get(candidate.provider) ?? []), candidate]);
	}

	return (
		<label className="flex items-center gap-1.5">
			<span className="sr-only">Model</span>
			<select
				className="max-w-[45vw] truncate rounded-md border bg-background px-2 py-1 text-xs text-foreground"
				value={current ?? ""}
				onChange={(event) => {
					const next = options.find((candidate) => keyOf(candidate) === event.target.value);
					if (next !== undefined) onSelect(next);
				}}
			>
				{current === undefined && <option value="">no model</option>}
				{providerOrder([...groups.keys()], model?.provider).map((provider) => (
					<optgroup key={provider} label={provider}>
						{(groups.get(provider) ?? [])
							.sort((a, b) => a.name.localeCompare(b.name))
							.map((candidate) => (
								<option key={keyOf(candidate)} value={keyOf(candidate)}>
									{candidate.name}
								</option>
							))}
					</optgroup>
				))}
			</select>
		</label>
	);
}
