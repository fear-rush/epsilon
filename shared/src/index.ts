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
} from "./protocol/frames";
export { dialogAnswerSchema, dialogQuestionSchema, extensionDisplaySchema } from "./extui";
export type { DialogAnswer, DialogQuestion, ExtensionDisplay } from "./extui";
export { PROTOCOL_VERSION } from "./protocol/version";
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
