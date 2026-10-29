/**
 * Identity, connection and the key. Every control shows its own validation
 * message, so a blank required field says so under the field instead of in one
 * notice at the bottom of the page.
 */
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
import { SettingsBlock, SettingsGroup } from "@/components/settings/settings-section";

import { ProviderApiSelect } from "./provider-api-select";
import type { ProviderDraft } from "./provider-draft";
import type { ProviderFieldErrors } from "./provider-validation";

export function ProviderConnection({
	draft,
	errors,
	builtin,
	lockId,
	hasKey,
	configured,
	namePlaceholder,
	update,
}: {
	draft: ProviderDraft;
	errors: ProviderFieldErrors;
	builtin: boolean;
	lockId: boolean;
	hasKey: boolean;
	configured: boolean;
	namePlaceholder?: string;
	update: (patch: Partial<ProviderDraft>) => void;
}) {
	const [reveal, setReveal] = useState(false);

	return (
		<>
			<SettingsGroup title="Provider">
				<SettingsBlock>
					<FieldGroup className="grid gap-3 sm:grid-cols-2">
						<Field data-invalid={errors.id !== undefined}>
							<FieldLabel htmlFor="provider-id">Provider id</FieldLabel>
							<Input
								id="provider-id"
								required
								value={draft.id}
								disabled={lockId}
								aria-invalid={errors.id !== undefined}
								onChange={(event) => update({ id: event.target.value })}
							/>
							<FieldError>{errors.id}</FieldError>
						</Field>
						<Field>
							<FieldLabel htmlFor="provider-name">Display name</FieldLabel>
							<Input
								id="provider-name"
								value={draft.name}
								placeholder={namePlaceholder}
								onChange={(event) => update({ name: event.target.value })}
							/>
						</Field>
						<Field data-invalid={errors.baseUrl !== undefined} className="sm:col-span-2">
							<FieldLabel htmlFor="provider-base-url">Base URL</FieldLabel>
							<Input
								id="provider-base-url"
								placeholder={builtin ? "pi default endpoint" : "https://api.example.com/v1"}
								value={draft.baseUrl}
								aria-invalid={errors.baseUrl !== undefined}
								onChange={(event) => update({ baseUrl: event.target.value })}
							/>
							<FieldDescription>
								{builtin
									? "Leave empty to use the endpoint pi ships"
									: "e.g. https://api.example.com/v1"}
							</FieldDescription>
							<FieldError>{errors.baseUrl}</FieldError>
						</Field>
					</FieldGroup>
				</SettingsBlock>
			</SettingsGroup>

			<SettingsGroup title="Connection">
				<SettingsBlock>
					<FieldGroup className="gap-3">
						<Field data-invalid={errors.api !== undefined}>
							<FieldLabel htmlFor="provider-api">API</FieldLabel>
							<ProviderApiSelect
								id="provider-api"
								showPath
								invalid={errors.api !== undefined}
								value={draft.api}
								onChange={(api) => update({ api })}
							/>
							<FieldError>{errors.api}</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor="provider-api-key">API key</FieldLabel>
							<div className="flex items-center gap-2">
								<InputGroup className="flex-1">
									<InputGroupInput
										id="provider-api-key"
										type={reveal ? "text" : "password"}
										autoComplete="off"
										value={draft.apiKey}
										onChange={(event) => update({ apiKey: event.target.value })}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupButton
											size="icon-xs"
											aria-label={reveal ? "Hide the key" : "Show the key"}
											onClick={() => setReveal((current) => !current)}
										>
											{reveal ? <EyeOffIcon /> : <EyeIcon />}
										</InputGroupButton>
									</InputGroupAddon>
								</InputGroup>
								{hasKey && <Badge variant="outline">Stored</Badge>}
							</div>
							{configured && !hasKey && (
								<FieldDescription>
									A credential from auth.json is already in use. A key typed here is written to
									models.json.
								</FieldDescription>
							)}
						</Field>
					</FieldGroup>
				</SettingsBlock>
			</SettingsGroup>
		</>
	);
}
