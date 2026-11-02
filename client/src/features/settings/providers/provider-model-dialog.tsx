/**
 * One model entry. The common fields stay visible; the compatibility overrides
 * are below them, because a model can override its provider's API and base URL
 * (useful when one gateway exposes several families).
 *
 * For an override the seed is pi's effective model, and Save reports only the
 * fields the operator touched, so pi's own values are never pinned. An override
 * has no API or base URL either: pi ignores both there, so those controls exist
 * only for a model entry.
 */
import { useState } from "react";
import { parseProviderApi } from "shared";
import { thinkingLevelSchema } from "shared";
import type { ProviderApi, ThinkingLevel } from "shared";

import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ModelCostFields } from "./provider-model-cost";
import { ModelAdvancedFields } from "./provider-model-advanced";
import { ModelReasoningFields } from "./provider-reasoning-fields";
import { formOf, touchedBy, valueOf } from "./provider-model-form";
import type { ModelField, ModelForm } from "./provider-model-form";
import { TestLevelSelect } from "./test-level-select";
import { useDialogMotion } from "@/hooks/use-dialog-motion";
import { keepUntouched } from "@/components/patterns/form/use-draft-form";
import { advancedFields, modelFieldErrors, modelFields } from "./provider-validation";
import type { ModelFieldErrors } from "./provider-validation";
import type { ProviderModelInput } from "@/api/types";
import type { ModelOverride } from "@/api/types";

export function ProviderModelDialog({
	onClose,
	title,
	mode,
	model,
	override,
	providerApi,
	lockId,
	onSave,
	onTest,
}: {
	/** Runs once the dialog finished closing, which is when its mount can drop it. */
	onClose: () => void;
	title: string;
	/** A model entry owns its API and base URL; an override does not. */
	mode: "model" | "override";
	model: ProviderModelInput | undefined;
	/** The stored override, when this dialog edits one instead of a model entry. */
	override?: ModelOverride;
	providerApi: ProviderApi | undefined;
	lockId: boolean;
	onSave: (model: ProviderModelInput, touched: ReadonlySet<ModelField>) => void;
	onTest: (model: ProviderModelInput, level?: ThinkingLevel) => Promise<string>;
}) {
	const [form, setForm] = useState<ModelForm>(() => formOf(model, override));
	const [touched, setTouched] = useState<ReadonlySet<ModelField>>(() => new Set());
	const [errors, setErrors] = useState<ModelFieldErrors>({});
	const [testing, setTesting] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [testLevel, setTestLevel] = useState("none");
	const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | undefined>();
	const endpoint = mode === "model";
	const validate = () => {
		const found: ModelFieldErrors = modelFieldErrors(form, endpoint);
		const headers = form.headerRows.some(
			(row) => row.key.trim() === "" || (row.value.trim() === "" && !row.stored),
		);
		if (headers) found.headers = "Fill the header name and value, or remove the row.";
		if (advancedFields.some((field) => found[field] !== undefined)) setAdvancedOpen(true);
		return found;
	};
	const update = (patch: Partial<ModelForm>) => {
		setForm((current) => ({ ...current, ...patch }));
		setTouched((current) => touchedBy(current, patch));
		setTestResult(undefined);
		const changed = Object.keys(patch).map((key) => (key === "headerRows" ? "headers" : key));
		setErrors((current) => keepUntouched(current, modelFields, changed));
	};
	const api = parseProviderApi(form.api);

	const runTest = async () => {
		const found = validate();
		setErrors(found);
		if (Object.keys(found).length > 0) return;
		setTesting(true);
		setTestResult(undefined);
		try {
			const parsed = thinkingLevelSchema.safeParse(testLevel);
			const level = form.reasoning && parsed.success ? parsed.data : undefined;
			setTestResult({ ok: true, message: await onTest(valueOf(form, providerApi), level) });
		} catch (error) {
			setTestResult({
				ok: false,
				message: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setTesting(false);
		}
	};

	const dialog = useDialogMotion();
	const close = () => dialog.close(onClose);

	return (
		<DialogFrame
			open={dialog.open}
			onOpenChange={(next) => {
				if (!next) close();
			}}
			size="lg"
			title={title}
			footer={
				<>
					<div className="flex items-center gap-2 sm:mr-auto">
						<TestLevelSelect
							value={testLevel}
							onChange={setTestLevel}
							disabled={!form.reasoning}
							className="w-36"
						/>
						<Button
							type="button"
							variant="outline"
							disabled={testing}
							onClick={() => void runTest()}
						>
							{testing && <Spinner data-icon="inline-start" />}
							Test model
						</Button>
					</div>
					<Button type="button" variant="destructive" onClick={close}>
						Cancel
					</Button>
					<Button type="submit" form="model-form">
						Save model
					</Button>
				</>
			}
		>
			<form
				id="model-form"
				noValidate
				className="grid gap-field"
				onSubmit={(event) => {
					event.preventDefault();
					if (!dialog.open) return;
					const found = validate();
					setErrors(found);
					if (Object.keys(found).length > 0) return;
					onSave(valueOf(form, providerApi), touched);
					close();
				}}
			>
				<FieldGroup className="grid gap-field sm:grid-cols-2">
					<Field data-invalid={errors.id !== undefined}>
						<FieldLabel htmlFor="model-id">Model id</FieldLabel>
						<Input
							id="model-id"
							required
							value={form.id}
							disabled={lockId}
							aria-invalid={errors.id !== undefined}
							onChange={(event) => update({ id: event.target.value })}
						/>
						<FieldError>{errors.id}</FieldError>
					</Field>
					<Field>
						<FieldLabel htmlFor="model-name">Display name</FieldLabel>
						<Input
							id="model-name"
							value={form.name}
							onChange={(event) => update({ name: event.target.value })}
						/>
					</Field>
					<Field data-invalid={errors.contextWindow !== undefined}>
						<FieldLabel htmlFor="model-context-window">Context window</FieldLabel>
						<Input
							id="model-context-window"
							inputMode="numeric"
							value={form.contextWindow}
							aria-invalid={errors.contextWindow !== undefined}
							onChange={(event) => update({ contextWindow: event.target.value })}
						/>
						<FieldDescription>Tokens</FieldDescription>
						<FieldError>{errors.contextWindow}</FieldError>
					</Field>
					<Field data-invalid={errors.maxTokens !== undefined}>
						<FieldLabel htmlFor="model-max-tokens">Max output tokens</FieldLabel>
						<Input
							id="model-max-tokens"
							inputMode="numeric"
							value={form.maxTokens}
							aria-invalid={errors.maxTokens !== undefined}
							onChange={(event) => update({ maxTokens: event.target.value })}
						/>
						<FieldError>{errors.maxTokens}</FieldError>
					</Field>
				</FieldGroup>
				<FieldGroup className="flex flex-wrap gap-x-6 gap-y-3">
					<Field orientation="horizontal" className="w-auto">
						<Checkbox
							id="model-reasoning"
							checked={form.reasoning}
							onCheckedChange={(checked) => update({ reasoning: checked })}
						/>
						<FieldLabel htmlFor="model-reasoning">Reasoning model</FieldLabel>
					</Field>
					<Field orientation="horizontal" className="w-auto">
						<Checkbox
							id="model-images"
							checked={form.images}
							onCheckedChange={(checked) => update({ images: checked })}
						/>
						<FieldLabel htmlFor="model-images">Accepts images</FieldLabel>
					</Field>
				</FieldGroup>
				{form.reasoning && (
					<ModelReasoningFields form={form} api={api ?? providerApi} update={update} />
				)}
				{override !== undefined &&
					(override.api !== undefined || override.baseUrl !== undefined) && (
						<Notice tone="info">
							pi ignores an API family or base URL stored in a model override, so the provider's
							apply; Epsilon keeps the stored values.
						</Notice>
					)}
				<ModelCostFields form={form} errors={errors} update={update} endpoint={endpoint} />
				<ModelAdvancedFields
					form={form}
					errors={errors}
					update={update}
					open={advancedOpen}
					onOpenChange={setAdvancedOpen}
				/>

				{testResult !== undefined && (
					<Notice tone={testResult.ok ? "success" : "error"}>{testResult.message}</Notice>
				)}
			</form>
		</DialogFrame>
	);
}
