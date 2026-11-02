/**
 * The settings sections, written once. The left navigation and the app
 * menu both map this list, so a section cannot exist in one and be missing from
 * the other.
 */
import { PackageIcon, PlugIcon, ServerIcon, SettingsIcon, SparklesIcon } from "lucide-react";
import type { ComponentType } from "react";

/** The section paths, as a union so a typo is a type error, not a dead link. */
export type SettingsPath =
	| "/settings/general"
	| "/settings/providers"
	| "/settings/mcp"
	| "/settings/skills"
	| "/settings/packages";

export type SettingsSection = {
	to: SettingsPath;
	label: string;
	icon: ComponentType<{ className?: string }>;
};

export const SETTINGS_GROUPS: { label: string; items: SettingsSection[] }[] = [
	{
		label: "App",
		items: [
			{ to: "/settings/general", label: "General", icon: SettingsIcon },
			{ to: "/settings/providers", label: "Providers", icon: PlugIcon },
		],
	},
	{
		label: "Resources",
		items: [
			{ to: "/settings/mcp", label: "MCP servers", icon: ServerIcon },
			{ to: "/settings/skills", label: "Skills", icon: SparklesIcon },
			{ to: "/settings/packages", label: "Packages", icon: PackageIcon },
		],
	},
];

export const SETTINGS_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap((group) => group.items);
