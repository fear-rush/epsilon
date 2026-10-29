/**
 * Header rows. A stored value never travels to the browser, so an empty value
 * keeps it; removing the row removes the header when the form is saved.
 */
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsBlock, SettingsGroup } from "@/components/settings/settings-section";

import type { HeaderRow } from "./provider-draft";

export function ProviderHeaders({
	rows,
	onChange,
}: {
	rows: HeaderRow[];
	onChange: (rows: HeaderRow[]) => void;
}) {
	const update = (index: number, patch: Partial<HeaderRow>) =>
		onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

	return (
		<SettingsGroup
			title="Headers"
			description="Added to every request from this provider. A blank value keeps a stored header."
		>
			<SettingsBlock>
				<div className="grid gap-2">
					{rows.length === 0 ? (
						<p className="text-sm text-muted-foreground">No custom header.</p>
					) : (
						rows.map((row, index) => (
							<div key={`${row.key}-${index}`} className="flex items-center gap-2">
								<Input
									value={row.key}
									disabled={row.stored}
									placeholder="Header name"
									aria-label="Header name"
									onChange={(event) => update(index, { key: event.target.value })}
								/>
								<Input
									value={row.value}
									placeholder={row.stored ? "Stored value (blank keeps it)" : "Value"}
									aria-label="Header value"
									onChange={(event) => update(index, { value: event.target.value })}
								/>
								<Button
									type="button"
									variant="destructive"
									size="icon-sm"
									aria-label="Remove header"
									onClick={() => onChange(rows.filter((_, at) => at !== index))}
								>
									<Trash2Icon />
								</Button>
							</div>
						))
					)}
					<div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => onChange([...rows, { key: "", value: "", stored: false }])}
						>
							<PlusIcon />
							Add header
						</Button>
					</div>
				</div>
			</SettingsBlock>
		</SettingsGroup>
	);
}
