import type { ComponentType } from "react";
import type { SettingsSnapshot } from "shared";

import { useSettings } from "@/hooks/use-settings";

import { SettingsGate } from "./settings-gate";

/**
 * The one shape a settings section route has: read the snapshot, then render one
 * section with it. Five route files used to repeat this wrapper by hand.
 */
export const settingsPage = (content: ComponentType<{ snapshot: SettingsSnapshot }>) =>
	function SettingsSectionPage() {
		return <SettingsGate query={useSettings()} content={content} />;
	};
