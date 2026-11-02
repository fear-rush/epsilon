/**
 * The Tools card: how the model reaches this server's tools, and, when a live
 * engine has seen them, one switch per tool with the hints the server sent. pi
 * reports a server's tools only once a chat has connected to it and keeps every
 * other connection state inside its own MCP extension, so the card says what is
 * missing rather than guessing which state it is. A switch edits the same draft
 * rows as the tool rules under Advanced, and writes only an exact tool name.
 */
import { useState } from "react";
import { effectiveToolExposure, isToolReachable, withToolReachable } from "shared";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Section } from "@/components/patterns/section/section";
import type { McpLiveServer } from "@/api/types";
import type { McpDraft } from "./mcp-draft";
import { exposureLabel } from "./mcp-exposure";
import { ExposureSelect } from "./mcp-exposure-select";

/** Beyond this many tools the list gets a filter. */
const FILTER_FROM = 10;

/**
 * The hints worth showing, in the order a reader needs them. A hint that is absent
 * says nothing: pi only passes on the ones the server set.
 */
const HINTS = [
	["destructiveHint", "destructive"],
	["readOnlyHint", "read-only"],
	["openWorldHint", "reaches outside"],
	["idempotentHint", "repeatable"],
] as const;

const hintsOf = (annotations: McpLiveServer["annotations"][string] | undefined): string[] =>
	HINTS.filter(([hint]) => annotations?.[hint] === true).map(([, label]) => label);

export function McpTools({
	draft,
	live,
	update,
}: {
	draft: McpDraft;
	/** What a live engine can see of this server, or undefined when none can. */
	live: McpLiveServer | undefined;
	update: (patch: Partial<McpDraft>) => void;
}) {
	const toolNames = live?.toolNames;
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
					{live === undefined && (
						<FieldDescription>
							No open session holds this server's tools. What pi last said about it is in the log
							under Advanced.
						</FieldDescription>
					)}
					{live !== undefined && live.tools === 0 && (
						<FieldDescription>
							Registered, but it has not offered a tool yet. pi keeps whether it is still
							connecting, failed or needs a sign-in inside its own MCP extension, so this card
							cannot tell those apart; the log can.
						</FieldDescription>
					)}
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
								const hints = hintsOf(live?.annotations[name]);
								return (
									<li key={name}>
										<label className="flex items-center justify-between gap-3 pad-row">
											<span className="flex min-w-0 items-baseline gap-2">
												<span className="min-w-0 truncate font-mono text-code">{name}</span>
												{hints.length > 0 && (
													<span className="shrink-0 text-meta text-muted-foreground">
														{hints.join(", ")}
													</span>
												)}
											</span>
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
