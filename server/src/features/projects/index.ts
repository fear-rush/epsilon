/** What other features may use from projects. */
export { placeOf } from "./domain";
export { projectStatusSchema, settingsScopeQuerySchema } from "./contract";
export {
	ProjectNotTrustedError,
	projectStatus,
	settingsFolder,
	trustedProjectFolder,
} from "./service";
