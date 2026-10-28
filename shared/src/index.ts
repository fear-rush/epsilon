// Shared, browser-safe code: the socket contract both sides parse with.
export type {
	ClientFrame,
	ProtocolErrorCode,
	ServerFrame,
	Snapshot,
	SnapshotCommand,
	SnapshotModel,
} from "./protocol/frames";
export {
	agentEventSchema,
	clientFrameSchema,
	dialogAnswerSchema,
	dialogRequestSchema,
	extensionDisplaySchema,
	protocolErrorCodeSchema,
	rpcCommandSchema,
	serverFrameSchema,
	snapshotSchema,
} from "./protocol/frames";
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
export type { DialogQuestion, ExtensionDisplay } from "./pi";
export type {
	JsonAgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcSessionState,
} from "./pi";
