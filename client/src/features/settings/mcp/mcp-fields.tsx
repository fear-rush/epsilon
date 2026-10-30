/**
 * Identity, reach and options of one MCP server. The name is the key in
 * `mcp.json`, so an existing entry cannot change it; the transport decides which
 * target fields the next block shows. `enabled` is not here: the list's checkbox
 * writes it, so the form never overwrites a toggle made while it was open.
 */
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
import { SettingsBlock, SettingsGroup } from "@/features/settings/kit/settings-section";
import { exposureDescription, exposureItems } from "./mcp-exposure";
import { McpToolExposureRows } from "./mcp-exposure-rows";
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
							{editing && (
								<FieldDescription>
									The key in mcp.json. It cannot be changed after the first save.
								</FieldDescription>
							)}
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
							<FieldLabel htmlFor="mcp-timeout">Request timeout (seconds)</FieldLabel>
							<Input
								id="mcp-timeout"
								inputMode="decimal"
								placeholder="60"
								value={draft.timeout}
								aria-invalid={errors.timeout !== undefined}
								onChange={(event) => update({ timeout: event.target.value })}
							/>
							<FieldError>{errors.timeout}</FieldError>
						</Field>
					</FieldGroup>
				</SettingsBlock>
			</SettingsGroup>

			<McpToolExposureRows
				rows={draft.toolExposure}
				error={errors.toolExposure}
				onChange={(toolExposure) => update({ toolExposure })}
			/>
		</>
	);
}
