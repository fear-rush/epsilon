/**
 * Identity, connection and the key. Every control shows its own validation
 * message, so a blank required field says so under the field instead of in one
 * notice at the bottom of the page.
 */
import { ChevronDownIcon, EyeIcon, EyeOffIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { parseProviderApi, providerApiInfo, providerBaseUrlProblem } from "shared";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
import { SettingsBlock, SettingsGroup } from "@/components/settings/settings-section";

import { ProviderApiSelect } from "./provider-api-select";
import { ReasoningCompatFields } from "./provider-reasoning-fields";
import type { ProviderDraft } from "./provider-draft";
import type { ProviderFieldErrors } from "./provider-validation";

/** An endpoint shown inline. Long gateway paths must wrap, not push the form out. */
function UrlCode({ children }: { children: string }) {
	return <code className="font-mono text-xs break-all">{children}</code>;
}

export function ProviderConnection({
	draft,
	errors,
	builtin,
	onNameChange,
	hasKey,
	configured,
	namePlaceholder,
	update,
}: {
	draft: ProviderDraft;
	errors: ProviderFieldErrors;
	builtin: boolean;
	onNameChange: (name: string) => void;
	hasKey: boolean;
	configured: boolean;
	namePlaceholder?: string;
	update: (patch: Partial<ProviderDraft>) => void;
}) {
	const [reveal, setReveal] = useState(false);
	const api = parseProviderApi(draft.api);
	const apiInfo = api === undefined ? undefined : providerApiInfo(api);
	const baseUrl = draft.baseUrl.trim();
	const baseProblem = api === undefined ? undefined : providerBaseUrlProblem(api, baseUrl);

	return (
		<>
			<SettingsGroup title="Provider">
				<SettingsBlock>
					<FieldGroup className="gap-3">
						<Field data-invalid={errors.name !== undefined}>
							<FieldLabel htmlFor="provider-name">Display name</FieldLabel>
							<Input
								id="provider-name"
								value={draft.name}
								placeholder={namePlaceholder ?? "e.g. CommandCode"}
								aria-invalid={errors.name !== undefined}
								onChange={(event) => onNameChange(event.target.value)}
							/>
							<FieldError>{errors.name}</FieldError>
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

						<Field data-invalid={errors.baseUrl !== undefined}>
							<FieldLabel htmlFor="provider-base-url">Base URL</FieldLabel>
							<Input
								id="provider-base-url"
								placeholder={builtin ? "pi default endpoint" : undefined}
								value={draft.baseUrl}
								aria-invalid={errors.baseUrl !== undefined}
								onChange={(event) => update({ baseUrl: event.target.value })}
							/>
							{baseProblem !== undefined && apiInfo !== undefined ? (
								<p className="flex gap-2">
									<TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
									<span>
										pi appends <UrlCode>{apiInfo.path}</UrlCode>, so this base should not end in{" "}
										<UrlCode>{baseProblem.repeated}</UrlCode>. Use{" "}
										<UrlCode>{baseProblem.suggestion}</UrlCode>.
									</span>
								</p>
							) : (
								builtin &&
								baseUrl === "" && (
									<FieldDescription className="text-xs">
										Leave empty to use the endpoint pi ships
									</FieldDescription>
								)
							)}
							<FieldError>{errors.baseUrl}</FieldError>
						</Field>

						<Field>
							<FieldLabel htmlFor="provider-api-key">API key</FieldLabel>
							<div className="flex items-center gap-2">
								<InputGroup className="flex-1">
									<InputGroupInput
										id="provider-api-key"
										type={reveal ? "text" : "password"}
										autoComplete="off"
										placeholder={
											hasKey
												? "Saved key — type to replace"
												: configured
													? "Credential in use — type to replace"
													: "API key"
										}
										value={draft.apiKey}
										onChange={(event) => update({ apiKey: event.target.value })}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupButton
											size="icon-xs"
											disabled={draft.apiKey === ""}
											aria-label={reveal ? "Hide the key" : "Show the key"}
											onClick={() => setReveal((current) => !current)}
										>
											{reveal ? <EyeOffIcon /> : <EyeIcon />}
										</InputGroupButton>
									</InputGroupAddon>
								</InputGroup>
							</div>
							{configured && !hasKey && (
								<FieldDescription>
									A credential from auth.json is already in use. A key typed here is written to
									models.json.
								</FieldDescription>
							)}
						</Field>
						{apiInfo !== undefined && (
							<Collapsible className="rounded-xl border">
								<CollapsibleTrigger className="group/reasoning flex w-full cursor-pointer items-center justify-between gap-2 rounded-[inherit] px-3 py-2.5 text-sm font-medium text-muted-foreground select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
									Reasoning defaults
									<ChevronDownIcon className="size-4 transition-transform group-aria-expanded/reasoning:rotate-180" />
								</CollapsibleTrigger>
								<CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 data-starting-style:h-0 data-ending-style:h-0">
									<div className="grid gap-3 px-3 pt-1 pb-3">
										<p className="text-sm text-muted-foreground">
											Applied to every model of this provider unless the model sets its own format.
										</p>
										<ReasoningCompatFields
											compat={draft.compat}
											api={api}
											idPrefix="provider"
											onChange={(compat) => update({ compat })}
										/>
									</div>
								</CollapsibleContent>
							</Collapsible>
						)}
					</FieldGroup>
				</SettingsBlock>
			</SettingsGroup>
		</>
	);
}
