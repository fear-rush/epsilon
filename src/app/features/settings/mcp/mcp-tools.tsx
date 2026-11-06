/**
 * The Tools card: how the model reaches this server's tools, and, when a live
 * engine has seen them, one switch per tool. The switch writes the rule pi matches
 * the server's own tool name against, which `mcpToolAddress()` derives from the
 * name pi registered; beside it, pi's own answer for the tool shows what the
 * running engine actually does, which a saved rule changes only when a session
 * opens the server again. pi reports a server's tools only once a chat has
 * connected to it and keeps every other connection state inside its own MCP
 * extension, so the card says what is missing rather than guessing which state it
 * is. A switch edits the same draft rows as the tool rules under Advanced.
 */
import { useState } from "react";

import { isToolReachable, withToolReachable } from "#domain/mcp/tools";
import type { McpLive, McpLiveTool } from "#protocol/settings/mcp";
import { Section } from "@/components/patterns/section/section";
import { toneText } from "@/components/patterns/status/status-tone";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

import type { McpDraft } from "./mcp-draft";
import { exposureLabel } from "./mcp-exposure";
import { ExposureSelect } from "./mcp-exposure-select";
import { mcpServerState } from "./mcp-state";

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

const hintsOf = (annotations: McpLiveTool["annotations"]): string[] =>
	HINTS.filter(([hint]) => annotations?.[hint] === true).map(([, label]) => label);

export function McpTools({
	draft,
	enabled,
	live,
	saved,
	update,
}: {
	draft: McpDraft;
	/** Whether the file says pi should connect this server. */
	enabled: boolean;
	/** What the live engines answered for this server's name. */
	live: McpLive | undefined;
	/** Whether the draft is what the file holds, so a disagreement is pi's answer to it. */
	saved: boolean;
	update: (patch: Partial<McpDraft>) => void;
}) {
	const server = live?.servers.find((entry) => entry.name === draft.name);
	const tools = server?.tools;
	const state = mcpServerState({ enabled, live, server, resources: live?.resourceTools ?? [] });
	const [filter, setFilter] = useState("");
	const rules = draft.toolExposure.map((row) => ({
		pattern: row.pattern,
		exposure: row.exposure,
	}));
	const shown =
		tools?.filter((tool) => tool.name.toLowerCase().includes(filter.trim().toLowerCase())) ?? [];
	const inexact = (tools ?? []).some((tool) => !tool.exact);
	/** Whether pi's answer for a tool contradicts the rule this form would write for it. */
	const disagrees =
		saved &&
		(tools ?? []).some(
			(tool) => (tool.exposure !== "hidden") !== isToolReachable(draft.exposure, rules, tool.key),
		);
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
					<FieldDescription className={state.warning ? toneText("warning") : undefined}>
						{state.text}
					</FieldDescription>
					{disagrees && (
						<FieldDescription>
							The running engine answers differently from this form. pi matches a rule against the
							name the server reports; when a rule still does not reach its tool, type that name
							under Advanced.
						</FieldDescription>
					)}
					{inexact && (
						<FieldDescription>
							pi matches a rule against the name the server reports, which it does not expose. Where
							the registered name cannot say it, the switch writes a pattern so the rule still
							reaches the tool.
						</FieldDescription>
					)}
				</Field>
				{tools !== undefined && tools.length > 0 && (
					<>
						{tools.length >= FILTER_FROM && (
							<Input
								value={filter}
								placeholder="Filter tools"
								aria-label="Filter tools"
								onChange={(event) => setFilter(event.target.value)}
							/>
						)}
						<ul className="max-h-dialog-body-md divide-y overflow-y-auto rounded-card border">
							{shown.map((tool) => {
								const reachable = isToolReachable(draft.exposure, rules, tool.key);
								const hints = hintsOf(tool.annotations);
								const piReachable = tool.exposure !== "hidden";
								const contradicting = saved && piReachable !== reachable;
								return (
									<li key={tool.name}>
										<label className="flex items-center justify-between gap-3 pad-row">
											<span className="flex min-w-0 items-baseline gap-2">
												<span className="min-w-0 truncate font-mono text-code">{tool.name}</span>
												{hints.length > 0 && (
													<span className="shrink-0 text-meta text-muted-foreground">
														{hints.join(", ")}
													</span>
												)}
											</span>
											<span className="flex shrink-0 items-center gap-3">
												{!tool.exact && (
													<span className="min-w-0 truncate font-mono text-meta text-muted-foreground">
														writes {tool.key}
													</span>
												)}
												<span
													className={cn(
														"text-meta",
														contradicting ? toneText("warning") : "text-muted-foreground",
													)}
												>
													pi: {exposureLabel(tool.exposure)}
												</span>
												<Switch
													size="sm"
													checked={reachable}
													aria-label={`${reachable ? "Hide" : "Show"} ${tool.name}`}
													onCheckedChange={(checked) =>
														update({
															toolExposure: withToolReachable(
																draft.exposure,
																rules,
																tool.key,
																checked,
															),
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
