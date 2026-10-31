/**
 * What most people never touch, in one closed card: the request timeout, the
 * per-tool rules, OAuth options, the provider token and pi's log for the server.
 * Everything but the log edits the draft. A failed save opens the card.
 */
import { useState } from "react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CollapsibleSection } from "@/components/patterns/section/collapsible-section";
import { FieldStack } from "@/components/patterns/section/field-stack";
import { Section } from "@/components/patterns/section/section";
import type { McpServerEntryDetail } from "./mcp-detail";
import type { McpDraft } from "./mcp-draft";
import { McpToolExposureRows } from "./mcp-exposure-rows";
import { McpOAuthFields } from "./mcp-oauth";
import type { McpField, McpFieldErrors } from "./mcp-validation";

/** The fields whose problems live in this card, so a failed save opens it. */
const ADVANCED_FIELDS: readonly McpField[] = ["timeout", "toolExposure", "oauth", "authProvider"];

export function McpAdvanced({
	draft,
	errors,
	providerIds,
	detail,
	signInName,
	update,
}: {
	draft: McpDraft;
	errors: McpFieldErrors;
	providerIds: readonly string[];
	detail: McpServerEntryDetail | undefined;
	/** The server's name when OAuth is configured, for the terminal sign-in line. */
	signInName: string | undefined;
	update: (patch: Partial<McpDraft>) => void;
}) {
	const [open, setOpen] = useState(false);
	const failing = ADVANCED_FIELDS.some((field) => errors[field] !== undefined);
	return (
		<CollapsibleSection title="Advanced" open={open || failing} onOpenChange={setOpen}>
			{signInName !== undefined && (
				<p className="text-meta text-muted-foreground">
					Sign in from a terminal: <code>pi mcp login {signInName}</code>
				</p>
			)}

			<Section title="Requests">
				<FieldStack>
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
				</FieldStack>
			</Section>

			<McpToolExposureRows
				rows={draft.toolExposure}
				error={errors.toolExposure}
				onChange={(toolExposure) => update({ toolExposure })}
			/>

			{draft.transport === "http" && (
				<McpOAuthFields
					scope={draft.scope}
					draft={draft}
					errors={errors}
					providerIds={providerIds}
					update={update}
				/>
			)}

			{detail !== undefined && detail.log.length > 0 && (
				<Section title="Server log">
					<pre className="max-h-dialog-body-sm overflow-auto bg-muted pad-row text-code whitespace-pre-wrap">
						{detail.log.join("\n")}
					</pre>
				</Section>
			)}
		</CollapsibleSection>
	);
}
