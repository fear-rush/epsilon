/**
 * Identity and description of one MCP server. The name is the key in mcp.json,
 * so an existing entry cannot change it; the transport decides which target
 * fields the next block shows.
 */
import { Checkbox } from "@/components/ui/checkbox";
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
						</Field>

						<Field orientation="horizontal">
							<Checkbox
								id="mcp-enabled"
								checked={draft.enabled}
								onCheckedChange={(checked) => update({ enabled: checked })}
							/>
							<FieldLabel htmlFor="mcp-enabled">Connect this server on session start</FieldLabel>
						</Field>
					</FieldGroup>
				</SettingsBlock>
			</SettingsGroup>

			<SettingsGroup title="Description">
				<SettingsBlock>
					<Field>
						<FieldLabel htmlFor="mcp-description">Description</FieldLabel>
						<Input
							id="mcp-description"
							value={draft.description}
							onChange={(event) => update({ description: event.target.value })}
						/>
						<FieldDescription>One sentence: what this server offers</FieldDescription>
					</Field>
				</SettingsBlock>
			</SettingsGroup>
		</>
	);
}
