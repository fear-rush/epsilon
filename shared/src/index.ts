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
} from "./permission/rules";
export type { PermissionMode } from "./permission/rules";
export {
	mcpExposureSchema,
	mcpNameSchema,
	mcpOverrideKeySchema,
	mcpRelationSchema,
	mcpScopeSchema,
	mcpTransportSchema,
} from "./mcp/rules";
export type { McpExposure, McpOverrideKey, McpRelation, McpScope, McpTransport } from "./mcp/rules";
export { skillDescriptionSchema, skillNameSchema } from "./skills/rules";
export { providerApiSchema, providerIdSchema } from "./providers/rules";
export type { ProviderApi } from "./providers/rules";
export { modelKey } from "./providers/model-key";
export {
	PROVIDER_APIS,
	parseProviderApi,
	providerApiInfo,
	providerBaseUrlProblem,
	providerEndpoint,
	providerModelsEndpoint,
} from "./providers/endpoints";
export type { ProviderApiInfo, ProviderBaseUrlProblem } from "./providers/endpoints";
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
