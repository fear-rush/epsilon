/**
 * One model entry. The common fields stay visible; the compatibility overrides
 * are below them, because a model can override its provider's API and base URL
 * (useful when one gateway exposes several families).
 */
import { useState } from "react";
import { parseProviderApi } from "shared";
import type { ProviderModelInput } from "shared";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ProviderApiSelect } from "./provider-api-select";
import { keepUntouched } from "./field-errors";
import { modelFieldErrors, modelFields } from "./provider-validation";
import type { ModelFieldErrors } from "./provider-validation";

const optionalNumber = (value: string): number | undefined => {
	const parsed = Number(value);
	return value.trim() !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const optionalCost = (value: string): number | undefined => {
	const parsed = Number(value);
	return value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

type ModelForm = {
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
});

export function ProviderModelDialog({
	open,
	onOpenChange,
	title,
	description,
	model,
	lockId,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	model: ProviderModelInput | undefined;
	lockId: boolean;
	onSave: (model: ProviderModelInput) => void;
}) {
	const [form, setForm] = useState<ModelForm>(() => formOf(model));
	const [errors, setErrors] = useState<ModelFieldErrors>({});
	const update = (patch: Partial<ModelForm>) => {
		setForm((current) => ({ ...current, ...patch }));
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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="grid gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						const found = modelFieldErrors(form);
						setErrors(found);
						if (Object.keys(found).length > 0) return;
						onSave({
							id: form.id.trim(),
							name: form.name.trim() || undefined,
							api,
							baseUrl: form.baseUrl.trim() || undefined,
							reasoning: form.reasoning,
							input: form.images ? ["text", "image"] : undefined,
							contextWindow: optionalNumber(form.contextWindow),
							maxTokens: optionalNumber(form.maxTokens),
							cost,
						});
						onOpenChange(false);
					}}
				>
					<FieldGroup className="grid gap-3 sm:grid-cols-2">
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
							<FieldDescription>The id sent to the API</FieldDescription>
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
					<FieldGroup className="flex flex-wrap gap-4">
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
					<details className="rounded-xl border p-3">
						<summary className="cursor-pointer text-sm text-muted-foreground">
							Cost and compatibility
						</summary>
						<FieldGroup className="mt-3 gap-3">
							<FieldGroup className="grid gap-3 sm:grid-cols-4">
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
								<ProviderApiSelect
									id="model-api"
									value={form.api}
									onChange={(api) => update({ api })}
								/>
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
					</details>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit">Save model</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
