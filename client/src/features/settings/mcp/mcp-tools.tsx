/**
 * The Tools card: how the model reaches this server's tools, and, when a live
 * engine has seen them, one switch per tool. pi reports a server's tools only
 * once a chat has connected to it, so without one nothing extra shows. A switch
 * edits the same draft rows as the tool rules under Advanced, and writes only an
 * exact tool name.
 */
import { useState } from "react";
import { effectiveToolExposure, isToolReachable, withToolReachable } from "shared";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Section } from "@/components/patterns/section/section";
import type { McpDraft } from "./mcp-draft";
import { exposureLabel } from "./mcp-exposure";
import { ExposureSelect } from "./mcp-exposure-select";

/** Beyond this many tools the list gets a filter. */
const FILTER_FROM = 10;

export function McpTools({
	draft,
	toolNames,
	update,
}: {
	draft: McpDraft;
	/** The tools a live engine registered, or undefined when none is known. */
	toolNames: readonly string[] | undefined;
	update: (patch: Partial<McpDraft>) => void;
}) {
	const [filter, setFilter] = useState("");
	const rules = draft.toolExposure.map((row) => ({
		pattern: row.pattern,
		exposure: row.exposure,
	}));
	const shown =
		toolNames?.filter((name) => name.toLowerCase().includes(filter.trim().toLowerCase())) ?? [];
	return (
		<Section title="Tools">
			<div className="grid gap-field pad-row">
				<Field>
					<FieldLabel htmlFor="mcp-exposure">Exposure</FieldLabel>
					<ExposureSelect
						id="mcp-exposure"
						value={draft.exposure}
						onChange={(exposure) => update({ exposure })}
					/>
				</Field>
				{toolNames !== undefined && toolNames.length > 0 && (
					<>
						{toolNames.length >= FILTER_FROM && (
							<Input
								value={filter}
								placeholder="Filter tools"
								aria-label="Filter tools"
								onChange={(event) => setFilter(event.target.value)}
							/>
						)}
						<ul className="max-h-dialog-body-md divide-y overflow-y-auto rounded-xl border">
							{shown.map((name) => {
								const reachable = isToolReachable(draft.exposure, rules, name);
								const effective = effectiveToolExposure(draft.exposure, rules, name);
								return (
									<li key={name}>
										<label className="flex items-center justify-between gap-3 pad-row">
											<span className="min-w-0 truncate font-mono text-code">{name}</span>
											<span className="flex shrink-0 items-center gap-3">
												{reachable && effective !== draft.exposure && (
													<span className="text-meta text-muted-foreground">
														{exposureLabel(effective)}
													</span>
												)}
												<Switch
													size="sm"
													checked={reachable}
													aria-label={`${reachable ? "Hide" : "Show"} ${name}`}
													onCheckedChange={(checked) =>
														update({
															toolExposure: withToolReachable(draft.exposure, rules, name, checked),
														})
													}
												/>
											</span>
										</label>
									</li>
								);
							})}
							{shown.length === 0 && (
								<li className="pad-row text-meta text-muted-foreground">No tool matches.</li>
							)}
						</ul>
					</>
				)}
			</div>
		</Section>
	);
}
