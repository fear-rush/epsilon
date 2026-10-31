/**
 * The two ways an HTTP server authenticates: pi's own OAuth flow, with the
 * options a server that cannot register clients needs, or the token of a
 * `/login` provider. Both are editable here because their values are what a save
 * has to keep valid for pi to accept the entry; signing in stays in the terminal
 * (docs/DECISIONS.md, Configure in the dashboard).
 */
import type { McpScope } from "shared";

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
import { FieldStack } from "@/components/patterns/section/field-stack";
import { Section } from "@/components/patterns/section/section";
import type { McpDraft } from "./mcp-draft";
import type { McpFieldErrors } from "./mcp-validation";

const registrationItems = [
	{ value: "auto", label: "Register a client (pi's default)" },
	{ value: "dcr", label: "Dynamic client registration" },
	{ value: "cimd", label: "Client ID Metadata Document" },
];

export function McpOAuthFields({
	scope,
	draft,
	errors,
	update,
	providerIds,
}: {
	scope: McpScope;
	draft: McpDraft;
	errors: McpFieldErrors;
	update: (patch: Partial<McpDraft>) => void;
	providerIds: readonly string[];
}) {
	return (
		<>
			<Section title="OAuth">
				<FieldStack>
					<Field>
						<FieldLabel htmlFor="mcp-oauth-client-id">Client ID</FieldLabel>
						<Input
							id="mcp-oauth-client-id"
							value={draft.oauthClientId}
							placeholder="Client ID"
							onChange={(event) => update({ oauthClientId: event.target.value })}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="mcp-oauth-client-secret">Client secret</FieldLabel>
						<Input
							id="mcp-oauth-client-secret"
							type="password"
							autoComplete="off"
							value={draft.oauthClientSecret}
							placeholder={draft.oauthClientSecretStored ? "Stored secret" : "Optional"}
							onChange={(event) => update({ oauthClientSecret: event.target.value })}
						/>
						{draft.oauthClientSecretStored && (
							<FieldDescription>Stored. Blank keeps it.</FieldDescription>
						)}
					</Field>
					<Field>
						<FieldLabel htmlFor="mcp-oauth-registration">Client registration</FieldLabel>
						<Select
							items={registrationItems}
							value={draft.oauthClientRegistration}
							onValueChange={(value) => {
								const picked = registrationItems.find((item) => item.value === value);
								if (picked?.value === "dcr" || picked?.value === "cimd") {
									update({ oauthClientRegistration: picked.value });
								} else {
									update({ oauthClientRegistration: "auto" });
								}
							}}
						>
							<SelectTrigger id="mcp-oauth-registration" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{registrationItems.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<FieldDescription>
							<code>cimd</code> cannot combine with a client ID or name.
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="mcp-oauth-callback-port">Callback port</FieldLabel>
						<Input
							id="mcp-oauth-callback-port"
							inputMode="numeric"
							value={draft.oauthCallbackPort}
							placeholder="Any free port"
							onChange={(event) => update({ oauthCallbackPort: event.target.value })}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="mcp-oauth-callback-url">Callback URL</FieldLabel>
						<Input
							id="mcp-oauth-callback-url"
							value={draft.oauthCallbackUrl}
							placeholder="http://localhost:8080/oauth/callback"
							onChange={(event) => update({ oauthCallbackUrl: event.target.value })}
						/>
						<FieldDescription>Plain HTTP on this machine.</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="mcp-oauth-scope">Scope</FieldLabel>
						<Input
							id="mcp-oauth-scope"
							value={draft.oauthScope}
							placeholder="read write"
							onChange={(event) => update({ oauthScope: event.target.value })}
						/>
						<FieldDescription>Space-separated.</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="mcp-oauth-client-name">Client name</FieldLabel>
						<Input
							id="mcp-oauth-client-name"
							value={draft.oauthClientName}
							placeholder="pi"
							onChange={(event) => update({ oauthClientName: event.target.value })}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="mcp-oauth-metadata">Authorization server metadata</FieldLabel>
						<Input
							id="mcp-oauth-metadata"
							value={draft.oauthAuthServerMetadataUrl}
							placeholder="https://example.okta.com/.well-known/openid-configuration"
							onChange={(event) => update({ oauthAuthServerMetadataUrl: event.target.value })}
						/>
						<FieldDescription>Only use a document you trust.</FieldDescription>
					</Field>
					{errors.oauth !== undefined && <FieldError>{errors.oauth}</FieldError>}
				</FieldStack>
			</Section>

			{scope === "global" && (
				<Section title="Provider token">
					<FieldStack>
						<Field data-invalid={errors.authProvider !== undefined}>
							<FieldLabel htmlFor="mcp-auth-provider">Auth provider</FieldLabel>
							<Input
								id="mcp-auth-provider"
								value={draft.authProvider}
								placeholder={providerIds[0]}
								aria-invalid={errors.authProvider !== undefined}
								onChange={(event) => update({ authProvider: event.target.value })}
							/>
							<FieldError>{errors.authProvider}</FieldError>
						</Field>
					</FieldStack>
				</Section>
			)}
		</>
	);
}
