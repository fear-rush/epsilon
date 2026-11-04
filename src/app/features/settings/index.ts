/** What other features may use from settings. */
export { SETTINGS_GROUPS, SETTINGS_SECTIONS } from "./shell/sections.ts";
export type { SettingsPath, SettingsSection } from "./shell/sections.ts";
export {
	settingsQuery,
	usePackageResources,
	usePackageUpdates,
	usePackageUpdatesRefresh,
	useSettings,
	useSettingsProject,
	useSettingsRefresh,
} from "./queries.ts";
