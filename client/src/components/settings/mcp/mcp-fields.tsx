/**
 * Identity, reach and options of one MCP server. The name is the key in
 * `mcp.json`, so an existing entry cannot change it; the transport decides which
 * target fields the next block shows. `enabled` is not here: the list's checkbox
 * writes it, so the form never overwrites a toggle made while it was open.
 */
import type { McpExposure } from "shared";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SettingsBlock, SettingsGroup } from "@/components/settings/settings-section";
import type { McpDraft } from "./mcp-draft";
import type { McpFieldErrors } from "./mcp-validation";

const transportItems = [
	{ value: "stdio", label: "stdio (a command)" },
	{ value: "http", label: "http (a URL)" },
];

/** The same four pi reads, and the one line that says what the model can reach. */
const exposureItems: { value: McpExposure; label: string }[] = [
	{ value: "codemode", label: "Codemode (default)" },
	{ value: "deferred", label: "Deferred (tool search)" },
	{ value: "direct", label: "Direct (declared to the model)" },
	{ value: "hidden", label: "Hidden (registered, unreachable)" },
];

const exposureDescription: Record<McpExposure, string> = {
	codemode: "Callable from codemode scripts, but not declared to the model.",
	deferred: "tool_search loads it when the model asks for it, then calls it directly.",
	direct: "Declared to the model like a built-in tool. Use it for a small, frequent set.",
	hidden: "Registered but unreachable. Useful with toolExposure rules that expose single tools.",
};

export function McpFields({
	draft,
	errors,
	editing,
	update,
}: {
	draft: McpDraft;
	errors: McpFieldErrors;
	editing: boolean;
	update: (patch: Partial<McpDraft>) => void;
}) {
	return (
		<>
			<SettingsGroup title="Server">
				<SettingsBlock>
					<FieldGroup className="gap-3">
						<Field data-invalid={errors.name !== undefined}>
							<FieldLabel htmlFor="mcp-name">Name</FieldLabel>
							<Input
								id="mcp-name"
								value={draft.name}
								disabled={editing}
								placeholder="e.g. filesystem"
								aria-invalid={errors.name !== undefined}
								onChange={(event) => update({ name: event.target.value })}
							/>
							<FieldDescription>
								{editing
									? "The key in mcp.json. It cannot be changed after the first save."
									: "Letters, digits, dashes and underscores. This is the key in mcp.json."}
							</FieldDescription>
							<FieldError>{errors.name}</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor="mcp-transport">Transport</FieldLabel>
							<Select
								items={transportItems}
								value={draft.transport}
								onValueChange={(value) =>
									update({ transport: value === "http" ? "http" : "stdio" })
								}
							>
								<SelectTrigger id="mcp-transport" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{transportItems.map((item) => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
							<FieldDescription>
								pi speaks stdio and streamable HTTP. A legacy SSE endpoint is refused; use its
								streamable HTTP URL instead.
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor="mcp-description">Description</FieldLabel>
							<Input
								id="mcp-description"
								value={draft.description}
								onChange={(event) => update({ description: event.target.value })}
							/>
							<FieldDescription>
								One sentence: what this server offers. pi lists it in the system prompt and ranks
								its tools by it.
							</FieldDescription>
						</Field>
					</FieldGroup>
				</SettingsBlock>
			</SettingsGroup>

			<SettingsGroup title="Tools">
				<SettingsBlock>
					<FieldGroup className="gap-3">
						<Field>
							<FieldLabel htmlFor="mcp-exposure">Exposure</FieldLabel>
							<Select
								items={exposureItems}
								value={draft.exposure}
								onValueChange={(value) => {
									const exposure = exposureItems.find((item) => item.value === value);
									if (exposure !== undefined) update({ exposure: exposure.value });
								}}
							>
								<SelectTrigger id="mcp-exposure" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{exposureItems.map((item) => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
							<FieldDescription>{exposureDescription[draft.exposure]}</FieldDescription>
						</Field>

						<Field data-invalid={errors.timeout !== undefined}>
							<FieldLabel htmlFor="mcp-timeout">Request timeout</FieldLabel>
							<Input
								id="mcp-timeout"
								inputMode="decimal"
								placeholder="60"
								value={draft.timeout}
								aria-invalid={errors.timeout !== undefined}
								onChange={(event) => update({ timeout: event.target.value })}
							/>
							<FieldDescription>
								Seconds per request. Leave it blank for pi&apos;s default of 60; a progress
								notification from the server resets it.
							</FieldDescription>
							<FieldError>{errors.timeout}</FieldError>
						</Field>
					</FieldGroup>
				</SettingsBlock>
			</SettingsGroup>
		</>
	);
}
