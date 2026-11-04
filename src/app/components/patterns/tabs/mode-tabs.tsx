import type { LucideIcon } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** One tab of a `ModeTabs` strip. */
export type ModeItem<T extends string> = {
	value: T;
	label: string;
	icon: LucideIcon;
};

/** A mode switch with an icon on each tab, such as Form and Raw. */
export function ModeTabs<T extends string>({
	items,
	value,
	onValueChange,
}: {
	items: readonly ModeItem<T>[];
	value: T;
	onValueChange: (value: T) => void;
}) {
	return (
		<Tabs
			value={value}
			onValueChange={(next: string) => {
				const item = items.find((entry) => entry.value === next);
				if (item !== undefined) onValueChange(item.value);
			}}
		>
			<TabsList className="w-full">
				{items.map(({ value: tab, label, icon: Icon }) => (
					<TabsTrigger key={tab} value={tab}>
						<Icon />
						{label}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}
