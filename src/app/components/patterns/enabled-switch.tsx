import { Switch } from "@/components/ui/switch";

/**
 * An on/off switch. The state is the switch's own position, so no "Enabled" is written
 * beside it (VO-5); `label` names it for screen readers.
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
		<Switch
			aria-label={`${checked ? "Disable" : "Enable"} ${label}`}
			checked={checked}
			disabled={disabled}
			onCheckedChange={onCheckedChange}
		/>
	);
}
