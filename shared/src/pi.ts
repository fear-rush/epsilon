/**
 * Type-only re-exports from the pinned pi package. Nothing else in `shared/`
 * may import `@earendil-works/*` (AGENTS.md, rule 1), and no runtime value from
 * pi may cross into the browser.
 */
import type { RpcExtensionUIRequest } from "@earendil-works/pi-coding-agent";

/** The extension requests that ask a question and block the agent until answered. */
export type DialogQuestion = Extract<
	RpcExtensionUIRequest,
	{ method: "select" | "confirm" | "input" | "editor" }
>;

/**
 * The extension UI methods that display something and never block the agent:
 * `notify`, `setStatus`, `setWidget`, `setTitle` and `set_editor_text`.
 */
export type ExtensionDisplay = Exclude<RpcExtensionUIRequest, DialogQuestion>;

export type {
	JsonAgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
	RpcSessionState,
} from "@earendil-works/pi-coding-agent";
