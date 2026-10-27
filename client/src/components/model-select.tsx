import { type ChatModel } from "shared";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import * as React from "react";

export function ModelSelect({
	models,
	value,
	onValueChange,
}: {
	models: readonly ChatModel[];
	value: string;
	onValueChange: (value: string) => void;
}) {
	const items = React.useMemo(
		() => models.map((model) => ({ label: model.name, value: model.id })),
		[models],
	);

	return (
		<Select
			items={items}
			value={value}
			onValueChange={(next) => {
				if (next !== null) onValueChange(next);
			}}
		>
			<SelectTrigger aria-label="Model" className="bg-background">
				<SelectValue />
			</SelectTrigger>
			<SelectContent alignItemWithTrigger={false} className="min-w-64">
				<SelectGroup>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
