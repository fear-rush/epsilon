import type { McpExposure } from "shared";

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

import { exposureItems } from "./mcp-exposure";

/** The four exposures as a select, for the server and for each tool rule. */
export function ExposureSelect({
	id,
	label,
	value,
	className,
	onChange,
}: {
	id?: string;
	label?: string;
	value: McpExposure;
	className?: string;
	onChange: (exposure: McpExposure) => void;
}) {
	return (
		<Select
			items={exposureItems}
			value={value}
			onValueChange={(next) => {
				const picked = exposureItems.find((item) => item.value === next);
				if (picked !== undefined) onChange(picked.value);
			}}
		>
			<SelectTrigger id={id} aria-label={label} className={className ?? "w-full"}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{exposureItems.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
