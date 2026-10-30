/**
 * Which pi levels a model offers and what each level sends. This is the map that
 * lets one provider serve models with different effort vocabularies; the wire
 * format below it is `compat`. A blank value uses pi's default for the level.
 */
import { ChevronDownIcon } from "lucide-react";
import type { ProviderApi, ThinkingLevel } from "shared";

import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { ReasoningCompatFields } from "./provider-reasoning-fields";
import { THINKING_LEVELS, THINKING_LEVEL_LABELS } from "./reasoning";
import type { LevelRow, ReasoningForm } from "./reasoning-form";
import { defaultsFor } from "./reasoning-form";

export function ModelReasoningFields({
	form,
	api,
	update,
}: {
	form: ReasoningForm;
	api: ProviderApi | undefined;
	update: (patch: Partial<ReasoningForm>) => void;
}) {
	const hasConfig =
		Object.values(form.levels).some((row) => !row.offered || row.value.trim() !== "") ||
		Object.keys(form.compat).length > 0;
	const setLevel = (level: ThinkingLevel, patch: Partial<LevelRow>) => {
		update({ levels: { ...form.levels, [level]: { ...form.levels[level], ...patch } } });
	};

	return (
		<Collapsible className="rounded-xl border" defaultOpen={hasConfig}>
			<CollapsibleTrigger className="group/reasoning flex w-full cursor-pointer items-center justify-between gap-2 rounded-[inherit] px-3 py-2.5 text-sm font-medium text-muted-foreground select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
				Reasoning effort
				<ChevronDownIcon className="size-4 transition-transform group-aria-expanded/reasoning:rotate-180" />
			</CollapsibleTrigger>
			<CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 data-starting-style:h-0 data-ending-style:h-0">
				<div className="grid gap-3 px-3 pt-1 pb-3">
					<p className="text-sm text-muted-foreground">
						The level's provider value. A blank value uses pi's default; uncheck a level the model
						does not offer.
					</p>
					<div className="grid gap-2">
						{THINKING_LEVELS.map((level) => (
							<div key={level} className="grid items-center gap-2 sm:grid-cols-[10rem_1fr]">
								<Field orientation="horizontal" className="w-auto">
									<Checkbox
										id={`model-level-${level}`}
										checked={form.levels[level].offered}
										onCheckedChange={(checked) => setLevel(level, { offered: checked === true })}
									/>
									<FieldLabel htmlFor={`model-level-${level}`} className="font-normal">
										{THINKING_LEVEL_LABELS[level]}
									</FieldLabel>
								</Field>
								<Input
									value={form.levels[level].value}
									disabled={!form.levels[level].offered}
									placeholder={defaultsFor(level) ? "pi default" : level}
									aria-label={`${THINKING_LEVEL_LABELS[level]} provider value`}
									onChange={(event) => setLevel(level, { value: event.target.value })}
								/>
							</div>
						))}
					</div>
					<div className="grid gap-3 border-t pt-3">
						<ReasoningCompatFields
							compat={form.compat}
							api={api}
							idPrefix="model"
							onChange={(compat) => update({ compat })}
						/>
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
