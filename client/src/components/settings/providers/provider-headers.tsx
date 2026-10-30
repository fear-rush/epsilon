/**
 * Header rows. A stored value never travels to the browser, so an empty value
 * keeps it; removing the row removes the header when the form is saved.
 */
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SettingsBlock, SettingsGroup } from "@/components/settings/settings-section";

import type { HeaderRow } from "./provider-draft";

export function ProviderHeaders({
	rows,
	error,
	onChange,
}: {
	rows: HeaderRow[];
	error?: string;
	onChange: (rows: HeaderRow[]) => void;
}) {
	const [removing, setRemoving] = useState<number | undefined>();
	const latest = useRef(rows);
	useEffect(() => {
		latest.current = rows;
	}, [rows]);
	const update = (index: number, patch: Partial<HeaderRow>) =>
		onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
	/** Let the row collapse, then drop it. The CSS transition is 200ms. */
	const remove = (index: number) => {
		setRemoving(index);
		window.setTimeout(() => {
			onChange(latest.current.filter((_, at) => at !== index));
			setRemoving(undefined);
		}, 220);
	};

	return (
		<SettingsGroup title="Custom Headers">
			<SettingsBlock>
				<div className="grid gap-2">
					{rows.map((row, index) => (
						<div key={index} className="header-row-anim" data-closing={removing === index}>
							<div className="flex items-center gap-2">
								<Input
									value={row.key}
									disabled={row.stored}
									placeholder="Header name"
									aria-label="Header name"
									onChange={(event) => update(index, { key: event.target.value })}
								/>
								<Input
									value={row.value}
									placeholder={row.stored ? "Stored value" : "Value"}
									aria-label="Header value"
									onChange={(event) => update(index, { value: event.target.value })}
								/>
								<Button
									type="button"
									variant="destructive"
									size="icon-sm"
									aria-label="Remove header"
									disabled={removing !== undefined}
									onClick={() => remove(index)}
								>
									<Trash2Icon />
								</Button>
							</div>
						</div>
					))}
					<div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => onChange([...rows, { key: "", value: "", stored: false }])}
						>
							<PlusIcon />
							Add custom headers
						</Button>
					</div>
					{error !== undefined && <FieldError>{error}</FieldError>}
				</div>
			</SettingsBlock>
		</SettingsGroup>
	);
}
