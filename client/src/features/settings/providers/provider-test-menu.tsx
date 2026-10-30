/**
 * Pick the model a provider test should use. A provider can expose both shapes
 * (for example an OpenAI endpoint with Claude ids), so testing the first model is
 * not enough; the list is searchable because a catalog can hold dozens.
 */
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { thinkingLevelSchema } from "shared";
import type { ThinkingLevel } from "shared";

import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";

import { TestLevelSelect } from "./test-level-select";
import type { ProviderModelInput } from "@/api/types";

export function ProviderTestMenu({
	models,
	pending,
	onPick,
}: {
	models: ProviderModelInput[];
	pending: boolean;
	onPick: (model: ProviderModelInput, level?: ThinkingLevel) => void;
}) {
	const [open, setOpen] = useState(false);
	const [level, setLevel] = useState("none");
	const empty = models.length === 0;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				disabled={empty || pending}
				render={
					<Button
						type="button"
						variant="outline"
						aria-label="Test a model"
						title={empty ? "Add a model first" : "Test a model"}
					/>
				}
			>
				{pending ? <Spinner data-icon="inline-start" /> : null}
				Test
				<ChevronDownIcon data-icon="inline-end" />
			</PopoverTrigger>
			<PopoverContent side="top" align="end" className="w-80 p-0">
				<div className="border-b p-2">
					<TestLevelSelect value={level} onChange={setLevel} />
				</div>
				<Command>
					<CommandInput placeholder="Search models…" />
					<CommandList>
						<CommandEmpty>No model matches.</CommandEmpty>
						<CommandGroup heading="Test a model">
							{models.map((model) => (
								<CommandItem
									key={model.id}
									value={`${model.id} ${model.name ?? ""}`}
									onSelect={() => {
										setOpen(false);
										const parsed = thinkingLevelSchema.safeParse(level);
										onPick(model, parsed.success ? parsed.data : undefined);
									}}
								>
									<span className="min-w-0 flex-1 truncate">{model.name ?? model.id}</span>
									<span className="shrink-0 text-xs text-muted-foreground">{model.id}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
