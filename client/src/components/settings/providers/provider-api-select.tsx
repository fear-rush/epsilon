/**
 * The API family picker, shared by the provider form and the model override.
 * Base UI resolves the trigger label from the `items` list, so the options are
 * declared once here and both callers get the same labels and the same value
 * for "follow the provider".
 */
import { PROVIDER_APIS } from "shared";

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

import { providerApiUnset } from "./provider-draft";

const apiItems = [
	{ value: providerApiUnset, label: "Use the provider's API", path: "" },
	...PROVIDER_APIS.map((entry) => ({
		value: entry.id,
		label: entry.label,
		path: entry.path,
	})),
];

const withPath = apiItems.map((item) => ({
	value: item.value,
	label: item.path === "" ? item.label : `${item.label} (${item.path})`,
}));

const withoutPath = apiItems.map(({ value, label }) => ({ value, label }));

export function ProviderApiSelect({
	id,
	value,
	onChange,
	showPath = false,
	invalid = false,
}: {
	id: string;
	value: string;
	onChange: (api: string) => void;
	showPath?: boolean;
	invalid?: boolean;
}) {
	const items = showPath ? withPath : withoutPath;

	return (
		<Select
			items={items}
			value={value === "" ? providerApiUnset : value}
			onValueChange={(next) => onChange(next === null || next === providerApiUnset ? "" : next)}
		>
			<SelectTrigger id={id} aria-invalid={invalid} className="w-full">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
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
