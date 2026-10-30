/**
 * The per-tool exposure rules (`toolExposure`). A key is a tool name as the
 * server offers it, or a pattern where `*` matches any characters; an exact name
 * wins over a pattern, and among patterns the first row wins, which is why the
 * order on screen is the order in the file.
 *
 * The labels are the short ones: a row has less width than the server-level
 * picker, and the exposure descriptions are in that picker.
 */
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { AnimatedRow } from "@/features/settings/kit/animated-row";
import { useAnimatedRows } from "@/features/settings/kit/use-animated-rows";
import { SettingsBlock, SettingsGroup } from "@/features/settings/kit/settings-section";

import { exposureShortItems } from "./mcp-exposure";
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
		<SettingsGroup title="Per-tool exposure">
			<SettingsBlock>
				<div className="grid gap-2">
					{rows.map((row, index) => (
						<AnimatedRow key={index} closing={closing === index}>
							<div className="flex items-center gap-2">
								<Input
									value={row.pattern}
									placeholder="search_*"
									aria-label="Tool name or pattern"
									onChange={(event) => update(index, { pattern: event.target.value })}
								/>
								<Select
									items={exposureShortItems}
									value={row.exposure}
									onValueChange={(value) => {
										const picked = exposureShortItems.find((item) => item.value === value);
										if (picked !== undefined) update(index, { exposure: picked.value });
									}}
								>
									<SelectTrigger aria-label="Exposure of this tool" className="w-36 shrink-0">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{exposureShortItems.map((item) => (
												<SelectItem key={item.value} value={item.value}>
													{item.label}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
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
					<FieldDescription>
						Overrides the server&apos;s exposure for the tools it matches. An exact name wins over a
						pattern, and among patterns the first rule wins.
					</FieldDescription>
					{error !== undefined && <FieldError>{error}</FieldError>}
				</div>
			</SettingsBlock>
		</SettingsGroup>
	);
}
