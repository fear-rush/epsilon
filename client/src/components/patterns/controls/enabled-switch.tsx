import { Switch } from "@/components/ui/switch";

/**
 * An on/off switch with its state written beside it, "Enabled" or "Disabled",
 * so a switch in a page's bar says what it controls without a tooltip.
 */
export function EnabledSwitch({
	checked,
	disabled = false,
	label,
	onCheckedChange,
}: {
	checked: boolean;
	disabled?: boolean;
	/** What is switched, for screen readers: "context7". */
	label: string;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-center gap-2 text-meta text-muted-foreground">
			{checked ? "Enabled" : "Disabled"}
			<Switch
				aria-label={`${checked ? "Disable" : "Enable"} ${label}`}
				checked={checked}
				disabled={disabled}
				onCheckedChange={onCheckedChange}
			/>
		</label>
	);
}
