/**
 * Identity, connection and the key. Every control shows its own validation
 * message, so a blank required field says so under the field instead of in one
 * notice at the bottom of the page.
 */
import { EyeIcon, EyeOffIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { parseProviderApi, providerApiInfo, providerBaseUrlProblem } from "shared";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Tip } from "@/components/patterns/tip";
import { Input } from "@/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
import { FieldStack } from "@/components/patterns/section/field-stack";
import { Section } from "@/components/patterns/section/section";
import { CollapsibleSection } from "@/components/patterns/section/collapsible-section";

import { ProviderApiSelect } from "./provider-api-select";
import { ReasoningCompatFields } from "./provider-reasoning-fields";
import type { ProviderDraft } from "./provider-draft";
import type { ProviderFieldErrors } from "./provider-validation";

/** An endpoint shown inline. Long gateway paths must wrap, not push the form out. */
function UrlCode({ children }: { children: string }) {
	return <code className="font-mono text-meta break-all">{children}</code>;
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
			<Section title="Provider">
				<FieldStack>
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
				</FieldStack>
			</Section>

			<Section title="Connection">
				<FieldStack>
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
						) : null}
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
									<Tip label={reveal ? "Hide the key" : "Show the key"}>
										<InputGroupButton
											size="icon-xs"
											disabled={draft.apiKey === ""}
											aria-label={reveal ? "Hide the key" : "Show the key"}
											onClick={() => setReveal((current) => !current)}
										>
											{reveal ? <EyeOffIcon /> : <EyeIcon />}
										</InputGroupButton>
									</Tip>
								</InputGroupAddon>
							</InputGroup>
						</div>
						{configured && !hasKey && (
							<FieldDescription>
								A credential from auth.json is in use. A typed key goes to models.json.
							</FieldDescription>
						)}
					</Field>
					{apiInfo !== undefined && (
						<CollapsibleSection title="Reasoning defaults">
							<div className="grid gap-field">
								<ReasoningCompatFields
									compat={draft.compat}
									api={api}
									idPrefix="provider"
									onChange={(compat) => update({ compat })}
								/>
							</div>
						</CollapsibleSection>
					)}
				</FieldStack>
			</Section>
		</>
	);
}
