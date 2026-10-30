/**
 * The two ways an HTTP server authenticates: pi's own OAuth flow, with the
 * options a server that cannot register clients needs, or the token of a
 * `/login` provider. Both are editable here because their values are what a save
 * has to keep valid for pi to accept the entry; signing in stays in the terminal
 * (docs/DECISIONS.md, Configure in the dashboard).
 */
import type { McpScope } from "shared";

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
			<SettingsGroup title="OAuth">
				<SettingsBlock>
					<FieldGroup className="gap-3">
						<Field>
							<FieldLabel htmlFor="mcp-oauth-client-id">Client ID</FieldLabel>
							<Input
								id="mcp-oauth-client-id"
								value={draft.oauthClientId}
								placeholder="Registered client id"
								onChange={(event) => update({ oauthClientId: event.target.value })}
							/>
							<FieldDescription>
								Leave it blank to let pi register itself with the authorization server.
							</FieldDescription>
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
							<FieldDescription>
								{draft.oauthClientSecretStored
									? "A secret is stored and is not shown. Leave it blank to keep it; remove it in the file."
									: "Optional. pi stores it in mcp.json, like an environment value."}
							</FieldDescription>
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
								<code>cimd</code> identifies pi by its own document instead of registering, and
								cannot be combined with a client ID or name.
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
							<FieldDescription>
								For a client registered with a fixed redirect URI:{" "}
								<code>http://127.0.0.1:&lt;port&gt;/callback</code>.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="mcp-oauth-callback-url">Callback URL</FieldLabel>
							<Input
								id="mcp-oauth-callback-url"
								value={draft.oauthCallbackUrl}
								placeholder="http://localhost:8080/oauth/callback"
								onChange={(event) => update({ oauthCallbackUrl: event.target.value })}
							/>
							<FieldDescription>
								The redirect URI registered for the client ID. It must be plain HTTP on this
								machine.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="mcp-oauth-scope">Scope</FieldLabel>
							<Input
								id="mcp-oauth-scope"
								value={draft.oauthScope}
								placeholder="read write"
								onChange={(event) => update({ oauthScope: event.target.value })}
							/>
							<FieldDescription>
								Space-separated. Leave it blank to request what the server advertises.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="mcp-oauth-client-name">Client name</FieldLabel>
							<Input
								id="mcp-oauth-client-name"
								value={draft.oauthClientName}
								placeholder="pi"
								onChange={(event) => update({ oauthClientName: event.target.value })}
							/>
							<FieldDescription>
								The name pi registers under, for servers that only accept known clients.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="mcp-oauth-metadata">Authorization server metadata</FieldLabel>
							<Input
								id="mcp-oauth-metadata"
								value={draft.oauthAuthServerMetadataUrl}
								placeholder="https://example.okta.com/.well-known/openid-configuration"
								onChange={(event) => update({ oauthAuthServerMetadataUrl: event.target.value })}
							/>
							<FieldDescription>
								Used instead of discovery, for a server that advertises the wrong authorization
								server. Only point it at a document you trust.
							</FieldDescription>
						</Field>
						{errors.oauth !== undefined && <FieldError>{errors.oauth}</FieldError>}
					</FieldGroup>
				</SettingsBlock>
			</SettingsGroup>

			{scope === "global" && (
				<SettingsGroup title="Provider token">
					<SettingsBlock>
						<FieldGroup className="gap-3">
							<Field data-invalid={errors.authProvider !== undefined}>
								<FieldLabel htmlFor="mcp-auth-provider">Auth provider</FieldLabel>
								<Input
									id="mcp-auth-provider"
									value={draft.authProvider}
									placeholder={providerIds[0]}
									aria-invalid={errors.authProvider !== undefined}
									onChange={(event) => update({ authProvider: event.target.value })}
								/>
								<FieldDescription>
									Send the token of a provider with a stored credential, instead of using OAuth.
									Known providers: {providerIds.join(", ") || "none yet"}.
								</FieldDescription>
								<FieldError>{errors.authProvider}</FieldError>
							</Field>
						</FieldGroup>
					</SettingsBlock>
				</SettingsGroup>
			)}
		</>
	);
}
