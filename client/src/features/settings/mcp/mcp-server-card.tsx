/**
 * The Server card: the name (fixed once written) and what the server offers.
 * The on/off switch lives in the page bar and writes at once; the rest is draft.
 */
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FieldStack } from "@/components/patterns/section/field-stack";
import { Section } from "@/components/patterns/section/section";

import type { McpDraft } from "./mcp-draft";

export function McpServerCard({
	draft,
	update,
}: {
	draft: McpDraft;
	update: (patch: Partial<McpDraft>) => void;
}) {
	return (
		<Section title="Server">
			<FieldStack>
				<Field>
					<FieldLabel htmlFor="mcp-name">Name</FieldLabel>
					<Input id="mcp-name" value={draft.name} disabled readOnly />
				</Field>
				<Field>
					<FieldLabel htmlFor="mcp-description">Description</FieldLabel>
					<Input
						id="mcp-description"
						value={draft.description}
						onChange={(event) => update({ description: event.target.value })}
					/>
				</Field>
			</FieldStack>
		</Section>
	);
}
