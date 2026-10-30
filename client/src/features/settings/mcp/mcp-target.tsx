/**
 * The target the selected transport needs: a command with arguments and an
 * environment, or a URL with headers, its OAuth options and the provider whose
 * token it may send. Only this target is sent; the other one stays in the draft
 * so switching back does not lose it.
 */
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PairRows } from "@/features/settings/kit/pair-rows";
import { SettingsBlock, SettingsGroup } from "@/features/settings/kit/settings-section";

import { McpOAuthFields } from "./mcp-oauth";
import type { McpDraft } from "./mcp-draft";
import type { McpFieldErrors } from "./mcp-validation";

export function McpTargetFields({
	draft,
	errors,
	providerIds,
	update,
}: {
	draft: McpDraft;
	errors: McpFieldErrors;
	providerIds: readonly string[];
	update: (patch: Partial<McpDraft>) => void;
}) {
	if (draft.transport === "stdio") {
		return (
			<>
				<SettingsGroup title="Command">
					<SettingsBlock>
						<FieldGroup className="gap-3">
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
									placeholder="e.g. packages/web"
									value={draft.cwd}
									onChange={(event) => update({ cwd: event.target.value })}
								/>
								<FieldDescription>
									Optional. A relative path resolves against the session directory.
								</FieldDescription>
							</Field>
						</FieldGroup>
					</SettingsBlock>
				</SettingsGroup>
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
			</>
		);
	}

	return (
		<>
			<SettingsGroup title="Endpoint">
				<SettingsBlock>
					<FieldGroup className="gap-3">
						<Field data-invalid={errors.url !== undefined}>
							<FieldLabel htmlFor="mcp-url">URL</FieldLabel>
							<Input
								id="mcp-url"
								placeholder="https://example.com/mcp"
								value={draft.url}
								aria-invalid={errors.url !== undefined}
								onChange={(event) => update({ url: event.target.value })}
							/>
							<FieldDescription>
								The streamable HTTP endpoint, for example https://example.com/mcp
							</FieldDescription>
							<FieldError>{errors.url}</FieldError>
						</Field>
					</FieldGroup>
				</SettingsBlock>
			</SettingsGroup>
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
			<McpOAuthFields
				scope={draft.scope}
				draft={draft}
				errors={errors}
				providerIds={providerIds}
				update={update}
			/>
		</>
	);
}
