// Shared, browser-safe code: the socket contract both sides parse with.
export type { ClientFrame, ProtocolErrorCode, ServerFrame, Snapshot } from "./protocol/frames";
export {
	agentEventSchema,
	clientFrameSchema,
	dialogAnswerSchema,
	dialogRequestSchema,
	protocolErrorCodeSchema,
	rpcCommandSchema,
	serverFrameSchema,
	snapshotSchema,
} from "./protocol/frames";
export { PROTOCOL_VERSION } from "./protocol/version";
export { emptyConversation } from "./conversation/state";
export { isVisibleMessage } from "./conversation/state";
export type {
	ConversationMessage,
	ConversationState,
	Notice,
	SnapshotMessage,
	StreamingTurn,
	ToolRun,
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
export type { DialogQuestion } from "./pi";
export type {
	JsonAgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcSessionState,
} from "./pi";
