import { CollapsibleSection } from "@/components/patterns/section/collapsible-section";
import { PairRowList } from "@/components/patterns/section/pair-rows";
/**
 * The fields most models never set: request limits, cache lifetimes, sampling
 * extras, cost tiers and per-model headers. Closed by default; the dialog opens
 * it when one of these fields fails validation, so an error is never hidden.
 *
 * A blank control is absent from the payload. JSON controls take the documented
 * shape; the dialog's validation names the field that is not JSON.
 */
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { ModelForm } from "./provider-model-form";
import type { ModelFieldErrors } from "./provider-validation";

function NumberField({
	id,
	label,
	value,
	error,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	error?: string | undefined;
	onChange: (value: string) => void;
}) {
	return (
		<Field data-invalid={error !== undefined}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				inputMode="numeric"
				value={value}
				aria-invalid={error !== undefined}
				onChange={(event) => onChange(event.target.value)}
			/>
			<FieldError>{error}</FieldError>
		</Field>
	);
}

function JsonField({
	id,
	label,
	description,
	value,
	error,
	onChange,
}: {
	id: string;
	label: string;
	description: string;
	value: string;
	error?: string | undefined;
	onChange: (value: string) => void;
}) {
	return (
		<Field data-invalid={error !== undefined}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Textarea
				id={id}
				className="font-mono text-meta"
				value={value}
				aria-invalid={error !== undefined}
				onChange={(event) => onChange(event.target.value)}
			/>
			<FieldDescription>{description}</FieldDescription>
			<FieldError>{error}</FieldError>
		</Field>
	);
}

export function ModelAdvancedFields({
	form,
	errors,
	update,
	open,
	onOpenChange,
}: {
	form: ModelForm;
	errors: ModelFieldErrors;
	update: (patch: Partial<ModelForm>) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<CollapsibleSection title="Advanced" open={open} onOpenChange={onOpenChange}>
			<div className="grid gap-field pad-row">
				<FieldGroup className="grid gap-field sm:grid-cols-2">
					<NumberField
						id="model-max-request-bytes"
						label="Max request bytes"
						value={form.maxRequestBytes}
						error={errors.maxRequestBytes}
						onChange={(maxRequestBytes) => update({ maxRequestBytes })}
					/>
					<NumberField
						id="model-image-width"
						label="Image max width"
						value={form.imageResizeWidth}
						error={errors.imageResizeWidth}
						onChange={(imageResizeWidth) => update({ imageResizeWidth })}
					/>
					<NumberField
						id="model-image-height"
						label="Image max height"
						value={form.imageResizeHeight}
						error={errors.imageResizeHeight}
						onChange={(imageResizeHeight) => update({ imageResizeHeight })}
					/>
					<NumberField
						id="model-image-bytes"
						label="Image max bytes"
						value={form.imageResizeBytes}
						error={errors.imageResizeBytes}
						onChange={(imageResizeBytes) => update({ imageResizeBytes })}
					/>
					<NumberField
						id="model-image-quality"
						label="JPEG quality"
						value={form.imageJpegQuality}
						error={errors.imageJpegQuality}
						onChange={(imageJpegQuality) => update({ imageJpegQuality })}
					/>
					<NumberField
						id="model-images-per-message"
						label="Images per message"
						value={form.imageMaxPerMessage}
						error={errors.imageMaxPerMessage}
						onChange={(imageMaxPerMessage) => update({ imageMaxPerMessage })}
					/>
					<NumberField
						id="model-images-per-request"
						label="Images per request"
						value={form.imageMaxPerRequest}
						error={errors.imageMaxPerRequest}
						onChange={(imageMaxPerRequest) => update({ imageMaxPerRequest })}
					/>
				</FieldGroup>

				<FieldGroup className="grid gap-field sm:grid-cols-2">
					<NumberField
						id="model-cache-short"
						label="Short cache (s)"
						value={form.promptCacheShort}
						error={errors.promptCacheShort}
						onChange={(promptCacheShort) => update({ promptCacheShort })}
					/>
					<NumberField
						id="model-cache-long"
						label="Long cache (s)"
						value={form.promptCacheLong}
						error={errors.promptCacheLong}
						onChange={(promptCacheLong) => update({ promptCacheLong })}
					/>
				</FieldGroup>

				<JsonField
					id="model-sampling-params"
					label="Sampling params"
					description="Extra fields added to every request."
					value={form.samplingParams}
					error={errors.samplingParams}
					onChange={(samplingParams) => update({ samplingParams })}
				/>
				<JsonField
					id="model-sampling-by-level"
					label="Sampling by thinking level"
					description="One object per thinking level."
					value={form.samplingParamsByLevel}
					error={errors.samplingParamsByLevel}
					onChange={(samplingParamsByLevel) => update({ samplingParamsByLevel })}
				/>
				<JsonField
					id="model-cost-tiers"
					label="Cost tiers"
					description="An array of { inputTokensAbove, input, output, cacheRead, cacheWrite }."
					value={form.costTiers}
					error={errors.costTiers}
					onChange={(costTiers) => update({ costTiers })}
				/>

				<Field data-invalid={errors.headers !== undefined}>
					<FieldLabel>Model headers</FieldLabel>
					<FieldDescription>
						Sent with this model&apos;s requests. A stored value stays on the server; leave it blank
						to keep it.
					</FieldDescription>
					<PairRowList
						rows={form.headerRows}
						error={errors.headers}
						addLabel="Add header"
						keyLabel="Header name"
						valueLabel="Header value"
						onChange={(headerRows) => update({ headerRows })}
					/>
				</Field>
			</div>
		</CollapsibleSection>
	);
}
