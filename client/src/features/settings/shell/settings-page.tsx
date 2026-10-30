import type { ComponentType } from "react";

import { useSettings } from "@/features/settings/queries";

import { SettingsGate } from "@/features/settings/kit/settings-gate";
import type { SettingsSnapshot } from "@/api/types";

/**
 * The one shape a settings section route has: read the snapshot, then render one
 * section with it. Five route files used to repeat this wrapper by hand.
 */
export const settingsPage = (content: ComponentType<{ snapshot: SettingsSnapshot }>) =>
	function SettingsSectionPage() {
		return <SettingsGate query={useSettings()} content={content} />;
	};
