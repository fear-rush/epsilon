/**
 * The per-tool exposure rules (`toolExposure`). A key is a tool name as the
 * server offers it, or a pattern where `*` matches any characters; an exact name
 * wins over a pattern, and among patterns the first row wins, which is why the
 * order on screen is the order in the file.
 *
 * A rule can name the same tool a switch under Tools writes, so the two always
 * edit the same draft rows.
 */
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AnimatedRow } from "@/components/patterns/section/animated-row";
import { Section } from "@/components/patterns/section/section";
import { Tip } from "@/components/patterns/tip";
import { useAnimatedRows } from "@/components/patterns/section/use-animated-rows";

import { ExposureSelect } from "./mcp-exposure-select";
import type { ExposureRow } from "./mcp-draft";

export function McpToolExposureRows({
	rows,
	error,
	onChange,
}: {
	rows: ExposureRow[];
	error?: string;
	onChange: (rows: ExposureRow[]) => void;
}) {
	const { closing, remove } = useAnimatedRows(rows, onChange);
	const update = (index: number, patch: Partial<ExposureRow>) =>
		onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
	return (
		<Section title="Tool rules">
			<div className="grid gap-2 pad-row">
				{rows.map((row, index) => (
					<AnimatedRow key={index} closing={closing === index}>
						<div className="flex items-center gap-2">
							<Input
								value={row.pattern}
								placeholder="search_*"
								aria-label="Tool name or pattern"
								onChange={(event) => update(index, { pattern: event.target.value })}
							/>
							<ExposureSelect
								label="Exposure of this tool"
								className="w-36 shrink-0"
								value={row.exposure}
								onChange={(exposure) => update(index, { exposure })}
							/>
							<Tip label="Remove">
								<Button
									type="button"
									variant="destructive"
									size="icon-sm"
									aria-label={`Remove ${row.pattern || "rule"}`}
									disabled={closing !== undefined}
									onClick={() => remove(index)}
								>
									<Trash2Icon />
								</Button>
							</Tip>
						</div>
					</AnimatedRow>
				))}
				<div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onChange([...rows, { pattern: "", exposure: "direct" }])}
					>
						<PlusIcon />
						Add rule
					</Button>
				</div>
				{error !== undefined && <FieldError>{error}</FieldError>}
			</div>
		</Section>
	);
}
