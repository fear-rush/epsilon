// Shared, browser-safe code: the socket contract both sides parse with.
export type {
	ClientFrame,
	DialogQuestion,
	ProtocolErrorCode,
	ServerFrame,
} from "./protocol/frames";
export {
	agentEventSchema,
	clientFrameSchema,
	dialogAnswerSchema,
	dialogRequestSchema,
	protocolErrorCodeSchema,
	rpcCommandSchema,
	serverFrameSchema,
} from "./protocol/frames";
export { PROTOCOL_VERSION } from "./protocol/version";
export type {
	JsonAgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcSessionState,
} from "./pi";
