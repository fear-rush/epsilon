/**
 * One model entry. The common fields stay visible; the compatibility overrides
 * are below them, because a model can override its provider's API and base URL
 * (useful when one gateway exposes several families).
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
import { ModelReasoningFields } from "./provider-reasoning-fields";
import { reasoningFormOf, reasoningOf } from "./reasoning";
import { TestLevelSelect } from "./test-level-select";
import type { ReasoningForm } from "./reasoning";
import { useDialogMotion } from "@/hooks/use-dialog-motion";
import { keepUntouched } from "@/components/patterns/form/use-draft-form";
import { modelFieldErrors, modelFields } from "./provider-validation";
import type { ModelFieldErrors } from "./provider-validation";
import type { ProviderModelInput } from "@/api/types";

const optionalNumber = (value: string): number | undefined => {
	const parsed = Number(value);
	return value.trim() !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const optionalCost = (value: string): number | undefined => {
	const parsed = Number(value);
	return value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

type ModelForm = ReasoningForm & {
	id: string;
	name: string;
	api: string;
	baseUrl: string;
	contextWindow: string;
	maxTokens: string;
	reasoning: boolean;
	images: boolean;
	costInput: string;
	costOutput: string;
	costCacheRead: string;
	costCacheWrite: string;
};

const formOf = (model: ProviderModelInput | undefined): ModelForm => ({
	id: model?.id ?? "",
	name: model?.name ?? "",
	api: model?.api ?? "",
	baseUrl: model?.baseUrl ?? "",
	contextWindow: model?.contextWindow?.toString() ?? "",
	maxTokens: model?.maxTokens?.toString() ?? "",
	reasoning: model?.reasoning ?? false,
	images: model?.input?.includes("image") ?? false,
	costInput: model?.cost?.input.toString() ?? "",
	costOutput: model?.cost?.output.toString() ?? "",
	costCacheRead: model?.cost?.cacheRead.toString() ?? "",
	costCacheWrite: model?.cost?.cacheWrite.toString() ?? "",
	...reasoningFormOf(model),
});

export function ProviderModelDialog({
	onClose,
	title,
	model,
	providerApi,
	lockId,
	onSave,
	onTest,
}: {
	/** Runs once the dialog finished closing, which is when its mount can drop it. */
	onClose: () => void;
	title: string;
	model: ProviderModelInput | undefined;
	providerApi: ProviderApi | undefined;
	lockId: boolean;
	onSave: (model: ProviderModelInput) => void;
	onTest: (model: ProviderModelInput, level?: ThinkingLevel) => Promise<string>;
}) {
	const [form, setForm] = useState<ModelForm>(() => formOf(model));
	const [errors, setErrors] = useState<ModelFieldErrors>({});
	const [testing, setTesting] = useState(false);
	const [testLevel, setTestLevel] = useState("none");
	const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | undefined>();
	const update = (patch: Partial<ModelForm>) => {
		setForm((current) => ({ ...current, ...patch }));
		setTestResult(undefined);
		setErrors((current) => keepUntouched(current, modelFields, Object.keys(patch)));
	};
	const api = parseProviderApi(form.api);
	const cost =
		optionalCost(form.costInput) !== undefined &&
		optionalCost(form.costOutput) !== undefined &&
		optionalCost(form.costCacheRead) !== undefined &&
		optionalCost(form.costCacheWrite) !== undefined &&
		form.costInput.trim() !== "" &&
		form.costOutput.trim() !== "" &&
		form.costCacheRead.trim() !== "" &&
		form.costCacheWrite.trim() !== ""
			? {
					input: optionalCost(form.costInput) ?? 0,
					output: optionalCost(form.costOutput) ?? 0,
					cacheRead: optionalCost(form.costCacheRead) ?? 0,
					cacheWrite: optionalCost(form.costCacheWrite) ?? 0,
				}
			: undefined;

	/** The form as the saved model, shared by Save and Test so they cannot drift. */
	const valueOf = (): ProviderModelInput => ({
		id: form.id.trim(),
		name: form.name.trim() || undefined,
		api,
		baseUrl: form.baseUrl.trim() || undefined,
		reasoning: form.reasoning,
		input: form.images ? ["text", "image"] : undefined,
		contextWindow: optionalNumber(form.contextWindow),
		maxTokens: optionalNumber(form.maxTokens),
		cost,
		...reasoningOf(form, api ?? providerApi),
	});

	const runTest = async () => {
		const found = modelFieldErrors(form);
		setErrors(found);
		if (Object.keys(found).length > 0) return;
		setTesting(true);
		setTestResult(undefined);
		try {
			const parsed = thinkingLevelSchema.safeParse(testLevel);
			const level = form.reasoning && parsed.success ? parsed.data : undefined;
			setTestResult({ ok: true, message: await onTest(valueOf(), level) });
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
					const found = modelFieldErrors(form);
					setErrors(found);
					if (Object.keys(found).length > 0) return;
					onSave(valueOf());
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
				<ModelCostFields form={form} errors={errors} update={update} />

				{testResult !== undefined && (
					<Notice tone={testResult.ok ? "success" : "error"}>{testResult.message}</Notice>
				)}
			</form>
		</DialogFrame>
	);
}
