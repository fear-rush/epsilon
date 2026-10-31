/**
 * Cost and the per-model API and base URL. Below the common fields because a
 * model can override its provider's family and endpoint (one gateway, several
 * families), not because every model needs them.
 */

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CollapsibleSection } from "@/components/patterns/section/collapsible-section";

import { ProviderApiSelect } from "./provider-api-select";
import type { ModelFieldErrors } from "./provider-validation";

type CostForm = {
	api: string;
	baseUrl: string;
	costInput: string;
	costOutput: string;
	costCacheRead: string;
	costCacheWrite: string;
};

export function ModelCostFields({
	form,
	errors,
	update,
}: {
	form: CostForm;
	errors: ModelFieldErrors;
	update: (patch: Partial<CostForm>) => void;
}) {
	return (
		<CollapsibleSection title="Cost and compatibility">
			<FieldGroup className="gap-field">
				<FieldGroup className="grid gap-field sm:grid-cols-2">
					<Field data-invalid={errors.costInput !== undefined}>
						<FieldLabel htmlFor="model-cost-input">Input /M</FieldLabel>
						<Input
							id="model-cost-input"
							inputMode="decimal"
							value={form.costInput}
							aria-invalid={errors.costInput !== undefined}
							onChange={(event) => update({ costInput: event.target.value })}
						/>
						<FieldError>{errors.costInput}</FieldError>
					</Field>
					<Field data-invalid={errors.costOutput !== undefined}>
						<FieldLabel htmlFor="model-cost-output">Output /M</FieldLabel>
						<Input
							id="model-cost-output"
							inputMode="decimal"
							value={form.costOutput}
							aria-invalid={errors.costOutput !== undefined}
							onChange={(event) => update({ costOutput: event.target.value })}
						/>
						<FieldError>{errors.costOutput}</FieldError>
					</Field>
					<Field data-invalid={errors.costCacheRead !== undefined}>
						<FieldLabel htmlFor="model-cost-cache-read">Cache read /M</FieldLabel>
						<Input
							id="model-cost-cache-read"
							inputMode="decimal"
							value={form.costCacheRead}
							aria-invalid={errors.costCacheRead !== undefined}
							onChange={(event) => update({ costCacheRead: event.target.value })}
						/>
						<FieldError>{errors.costCacheRead}</FieldError>
					</Field>
					<Field data-invalid={errors.costCacheWrite !== undefined}>
						<FieldLabel htmlFor="model-cost-cache-write">Cache write /M</FieldLabel>
						<Input
							id="model-cost-cache-write"
							inputMode="decimal"
							value={form.costCacheWrite}
							aria-invalid={errors.costCacheWrite !== undefined}
							onChange={(event) => update({ costCacheWrite: event.target.value })}
						/>
						<FieldError>{errors.costCacheWrite}</FieldError>
					</Field>
				</FieldGroup>
				<Field>
					<FieldLabel htmlFor="model-api">Model API</FieldLabel>
					<ProviderApiSelect id="model-api" value={form.api} onChange={(api) => update({ api })} />
					<FieldDescription>Overrides the provider's API for this model</FieldDescription>
				</Field>
				<Field data-invalid={errors.baseUrl !== undefined}>
					<FieldLabel htmlFor="model-base-url">Model base URL</FieldLabel>
					<Input
						id="model-base-url"
						value={form.baseUrl}
						aria-invalid={errors.baseUrl !== undefined}
						onChange={(event) => update({ baseUrl: event.target.value })}
					/>
					<FieldDescription>Overrides the provider's base URL</FieldDescription>
					<FieldError>{errors.baseUrl}</FieldError>
				</Field>
			</FieldGroup>
		</CollapsibleSection>
	);
}
