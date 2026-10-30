// Shared, browser-safe code: the socket contract both sides parse with.
export type {
	ClientFrame,
	Command,
	CommandName,
	ProtocolErrorCode,
	ServerFrame,
	Snapshot,
	SnapshotCommand,
	SnapshotModel,
	SnapshotState,
	ThinkingLevel,
} from "./protocol/frames";
export {
	agentEventSchema,
	clientFrameSchema,
	commandNameSchema,
	commandSchema,
	protocolErrorCodeSchema,
	serverFrameSchema,
	snapshotCommandSchema,
	snapshotModelSchema,
	snapshotSchema,
	snapshotStateSchema,
	thinkingLevelSchema,
} from "./protocol/frames";
export { dialogAnswerSchema, dialogQuestionSchema, extensionDisplaySchema } from "./extui";
export type { DialogAnswer, DialogQuestion, ExtensionDisplay } from "./extui";
export { PROTOCOL_VERSION } from "./protocol/version";
export {
	PERMISSION_MODE_VALUES,
	PERMISSION_STATUS_KEY,
	parsePermissionStatus,
	permissionModeSchema,
	permissionStatusText,
} from "./permission";
export type { PermissionMode } from "./permission";
export { modelKey } from "./model-key";
export { problemSchema } from "./schemas/problem";
export type { Problem } from "./schemas/problem";
export {
	sessionErrorCodeSchema,
	sessionErrorSchema,
	sessionListSchema,
	sessionSummarySchema,
} from "./schemas/sessions";
export type {
	SessionError,
	SessionErrorCode,
	SessionList,
	SessionSummary,
} from "./schemas/sessions";
export { readinessSchema } from "./schemas/readiness";
export type { Readiness } from "./schemas/readiness";
export {
	builtinProviderSchema,
	defaultModelSchema,
	mcpNameSchema,
	mcpServerDetailSchema,
	mcpServerInputSchema,
	mcpServerViewSchema,
	mcpTransportSchema,
	modelOverrideSchema,
	packageViewSchema,
	providerApiSchema,
	providerDetailSchema,
	providerIdSchema,
	providerImportInputSchema,
	providerImportResultSchema,
	providerInputSchema,
	providerModelCostSchema,
	providerModelInputSchema,
	providerTestInputSchema,
	providerTestResultSchema,
	providerViewSchema,
	reasoningCompatSchema,
	thinkingLevelMapSchema,
	settingsSnapshotSchema,
	skillInputSchema,
	skillNameSchema,
	skillViewSchema,
} from "./schemas/settings";
export type {
	BuiltinProvider,
	DefaultModel,
	McpServerDetail,
	McpServerInput,
	McpServerView,
	McpTransport,
	ModelOverride,
	PackageView,
	ProviderApi,
	ProviderDetail,
	ProviderImportInput,
	ProviderImportResult,
	ProviderInput,
	ProviderModelCost,
	ProviderModelInput,
	ProviderTestInput,
	ProviderTestResult,
	ProviderView,
	ReasoningCompat,
	SettingsSnapshot,
	SkillInput,
	SkillView,
	ThinkingLevelMap,
} from "./schemas/settings";
export {
	PROVIDER_APIS,
	parseProviderApi,
	providerApiInfo,
	providerBaseUrlProblem,
	providerEndpoint,
	providerModelsEndpoint,
} from "./provider-endpoints";
export type { ProviderApiInfo, ProviderBaseUrlProblem } from "./provider-endpoints";
export { emptyConversation } from "./conversation/state";
export { isVisibleMessage } from "./conversation/state";
export type {
	ConversationMessage,
	ConversationState,
	Notice,
	SnapshotMessage,
	StreamingTurn,
	ToolRun,
	UiStatus,
	UiWidget,
} from "./conversation/state";
export { reduce } from "./conversation/reduce";
export { isStreaming, transcript } from "./conversation/selectors";
export {
	bashArgsSchema,
	editArgsSchema,
	readArgsSchema,
	writeArgsSchema,
} from "./conversation/tools";
export type { TranscriptRow } from "./conversation/selectors";
export type { JsonAgentSessionEvent } from "./pi";
