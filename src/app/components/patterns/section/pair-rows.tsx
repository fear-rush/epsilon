/**
 * Key/value rows for a stored map. A stored value never travels to the browser,
 * so a blank value keeps it; removing the row removes the entry when the form is
 * saved. A new row needs both a key and a value, and the form refuses an
 * incomplete row. Rows grow and collapse instead of popping in and out.
 */
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { AnimatedRow } from "./animated-row";
import { Section } from "./section";
import { useAnimatedRows } from "./use-animated-rows";

export type PairRow = {
	key: string;
	value: string;
	/** The value is stored on the server and was not sent to this page. */
	stored: boolean;
};

export function PairRows({
	title,
	addLabel,
	rows,
	error,
	keyLabel,
	valueLabel,
	keyPlaceholder,
	onChange,
}: {
	title: string;
	addLabel: string;
	rows: PairRow[];
	error?: string | undefined;
	keyLabel: string;
	valueLabel: string;
	keyPlaceholder?: string;
	onChange: (rows: PairRow[]) => void;
}) {
	return (
		<Section title={title}>
			<div className="p-4">
				<PairRowList
					rows={rows}
					addLabel={addLabel}
					keyLabel={keyLabel}
					valueLabel={valueLabel}
					onChange={onChange}
					{...(error === undefined ? {} : { error })}
					{...(keyPlaceholder === undefined ? {} : { keyPlaceholder })}
				/>
			</div>
		</Section>
	);
}

/** The rows without the card, for a form that already draws its own surface. */
export function PairRowList({
	rows,
	error,
	addLabel,
	keyLabel,
	valueLabel,
	keyPlaceholder,
	onChange,
}: {
	rows: PairRow[];
	error?: string | undefined;
	addLabel: string;
	keyLabel: string;
	valueLabel: string;
	keyPlaceholder?: string;
	onChange: (rows: PairRow[]) => void;
}) {
	// A row has no id of its own, so the list hands each one: new rows take the next
	// number and a removal drops its number with it.
	const [ids, setIds] = useState<{ list: number[]; next: number }>({ list: [], next: 0 });
	if (ids.list.length !== rows.length) {
		const list = ids.list.slice(0, rows.length);
		let next = ids.next;
		while (list.length < rows.length) list.push(next++);
		setIds({ list, next });
	}
	const { closing, remove } = useAnimatedRows(rows, (kept) => {
		setIds((current) => ({
			...current,
			list: current.list.filter((_, at) => at !== closing),
		}));
		onChange(kept);
	});
	const update = (index: number, patch: Partial<PairRow>) =>
		onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

	return (
		<div className="grid gap-2">
			{rows.map((row, index) => (
				<AnimatedRow key={ids.list[index]} closing={closing === index}>
					<div className="flex items-center gap-2">
						<Input
							value={row.key}
							disabled={row.stored}
							placeholder={keyPlaceholder ?? keyLabel}
							aria-label={keyLabel}
							onChange={(event) => update(index, { key: event.target.value })}
						/>
						<Input
							value={row.value}
							placeholder={row.stored ? "Stored value" : "Value"}
							aria-label={valueLabel}
							onChange={(event) => update(index, { value: event.target.value })}
						/>
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										type="button"
										variant="destructive"
										size="icon-sm"
										aria-label={`Remove ${row.key || "row"}`}
										disabled={closing !== undefined}
										onClick={() => remove(index)}
									/>
								}
							>
								<Trash2Icon />
							</TooltipTrigger>
							<TooltipContent>Remove</TooltipContent>
						</Tooltip>
					</div>
				</AnimatedRow>
			))}
			<div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => onChange([...rows, { key: "", value: "", stored: false }])}
				>
					<PlusIcon />
					{addLabel}
				</Button>
			</div>
			{error !== undefined && <FieldError>{error}</FieldError>}
		</div>
	);
}
