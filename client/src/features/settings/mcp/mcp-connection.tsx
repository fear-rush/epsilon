/**
 * The Connection card: how the server runs and the target that transport needs
 * (a command with arguments and an environment, or a URL with headers). Only the
 * selected transport's target is sent; the other stays in the draft so switching
 * back does not lose what was typed.
 */
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PairRows } from "@/components/patterns/section/pair-rows";
import { FieldStack } from "@/components/patterns/section/field-stack";
import { Section } from "@/components/patterns/section/section";

import type { McpDraft } from "./mcp-draft";
import type { McpFieldErrors } from "./mcp-validation";

const transportItems = [
	{ value: "stdio", label: "Command (stdio)" },
	{ value: "http", label: "URL (HTTP)" },
];

export function McpConnection({
	draft,
	errors,
	update,
}: {
	draft: McpDraft;
	errors: McpFieldErrors;
	update: (patch: Partial<McpDraft>) => void;
}) {
	const stdio = draft.transport === "stdio";
	return (
		<>
			<Section title="Connection">
				<FieldStack>
					<Field>
						<FieldLabel htmlFor="mcp-transport">Transport</FieldLabel>
						<Select
							items={transportItems}
							value={draft.transport}
							onValueChange={(next) => {
								if (next === "stdio" || next === "http") update({ transport: next });
							}}
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

					{stdio ? (
						<>
							<Field data-invalid={errors.command !== undefined}>
								<FieldLabel htmlFor="mcp-command">Command</FieldLabel>
								<Input
									id="mcp-command"
									placeholder="npx"
									value={draft.command}
									aria-invalid={errors.command !== undefined}
									onChange={(event) => update({ command: event.target.value })}
								/>
								<FieldDescription>One executable, not a shell string</FieldDescription>
								<FieldError>{errors.command}</FieldError>
							</Field>
							<Field>
								<FieldLabel htmlFor="mcp-args">Arguments</FieldLabel>
								<Textarea
									id="mcp-args"
									rows={3}
									value={draft.args}
									onChange={(event) => update({ args: event.target.value })}
								/>
								<FieldDescription>One argument per line</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="mcp-cwd">Working directory</FieldLabel>
								<Input
									id="mcp-cwd"
									placeholder="packages/web"
									value={draft.cwd}
									onChange={(event) => update({ cwd: event.target.value })}
								/>
							</Field>
						</>
					) : (
						<Field data-invalid={errors.url !== undefined}>
							<FieldLabel htmlFor="mcp-url">URL</FieldLabel>
							<Input
								id="mcp-url"
								placeholder="https://example.com/mcp"
								value={draft.url}
								aria-invalid={errors.url !== undefined}
								onChange={(event) => update({ url: event.target.value })}
							/>
							<FieldError>{errors.url}</FieldError>
						</Field>
					)}
				</FieldStack>
			</Section>

			{stdio ? (
				<PairRows
					title="Environment"
					addLabel="Add variable"
					keyLabel="Variable name"
					valueLabel="Variable value"
					keyPlaceholder="KEY"
					rows={draft.env}
					error={errors.env}
					onChange={(env) => update({ env })}
				/>
			) : (
				<PairRows
					title="Headers"
					addLabel="Add header"
					keyLabel="Header name"
					valueLabel="Header value"
					keyPlaceholder="Authorization"
					rows={draft.headers}
					error={errors.headers}
					onChange={(headers) => update({ headers })}
				/>
			)}
		</>
	);
}
