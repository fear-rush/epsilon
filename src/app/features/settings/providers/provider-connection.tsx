/**
 * Identity, connection and the key. Every control shows its own validation
 * message, so a blank required field says so under the field instead of in one
 * notice at the bottom of the page.
 */
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";

import { isProviderApi, providerApiInfo, providerBaseUrlProblem } from "#domain/providers/rules";
import { CollapsibleSection } from "@/components/patterns/section/collapsible-section";
import { FieldStack } from "@/components/patterns/section/field-stack";
import { Section } from "@/components/patterns/section/section";
import { Notice } from "@/components/patterns/status/notice";
import { Tip } from "@/components/patterns/tip";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

import { ProviderApiSelect } from "./provider-api-select";
import type { ProviderDraft } from "./provider-draft";
import { ReasoningCompatFields } from "./provider-reasoning-fields";
import type { ProviderFieldErrors } from "./provider-validation";

/** An endpoint shown inline. Long gateway paths must wrap, not push the form out. */
function UrlCode({ children }: { children: string }) {
	return <code className="font-mono text-meta break-all">{children}</code>;
}

const AUTH_HEADER_ITEMS = [
	{ value: "auto", label: "pi default" },
	{ value: "yes", label: "Send as Bearer" },
	{ value: "no", label: "Never" },
];

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
	const api = isProviderApi(draft.api) ? draft.api : undefined;
	const apiInfo = api === undefined ? undefined : providerApiInfo(api);
	const baseUrl = draft.baseUrl.trim();
	const baseProblem = api === undefined ? undefined : providerBaseUrlProblem(api, baseUrl);
	const keyPlaceholder = hasKey
		? "Saved key — type to replace"
		: configured
			? "Credential in use — type to replace"
			: "API key";

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
							onChange={(next) => update({ api: next })}
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
							<Notice tone="warning">
								pi appends <UrlCode>{apiInfo.path}</UrlCode>, so this base should not end in{" "}
								<UrlCode>{baseProblem.repeated}</UrlCode>. Use{" "}
								<UrlCode>{baseProblem.suggestion}</UrlCode>.
							</Notice>
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
									placeholder={keyPlaceholder}
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
					<Field>
						<FieldLabel htmlFor="provider-auth-header">Authorization header</FieldLabel>
						<Select
							items={AUTH_HEADER_ITEMS}
							value={draft.authHeader === "" ? "auto" : draft.authHeader}
							onValueChange={(next) => {
								if (next === null) return;
								update({ authHeader: next === "yes" ? "yes" : next === "no" ? "no" : "" });
							}}
						>
							<SelectTrigger id="provider-auth-header" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{AUTH_HEADER_ITEMS.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<FieldDescription>
							How pi sends the resolved key when the endpoint needs a bearer header.
						</FieldDescription>
					</Field>
					<Field>
						<div className="flex items-center gap-2">
							<Checkbox
								id="provider-oauth"
								checked={draft.oauth}
								onCheckedChange={(checked) => update({ oauth: checked })}
							/>
							<FieldLabel htmlFor="provider-oauth">Radius OAuth</FieldLabel>
						</div>
						<FieldDescription>
							pi runs the radius OAuth flow for this provider; it needs a base URL.
						</FieldDescription>
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
