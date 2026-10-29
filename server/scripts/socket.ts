/**
 * The one socket client the manual checks share: one URL, one frame parse, one
 * send, and one place that knows how to answer a dialog under the current
 * contract. These scripts run against a live server, not a test harness.
 */
import { PROTOCOL_VERSION, clientFrameSchema, serverFrameSchema } from "shared";
import type { ClientFrame, DialogAnswer, DialogQuestion, ServerFrame } from "shared";

/** The server's port, which `bun run dev` and a hand check can change. */
const port = process.env.PORT ?? "3000";

export const SOCKET_URL = `ws://127.0.0.1:${port}/api/link`;

export const send = (socket: WebSocket, frame: ClientFrame): void => {
	socket.send(JSON.stringify(clientFrameSchema.parse(frame)));
};

export const parseFrame = (data: string): ServerFrame => serverFrameSchema.parse(JSON.parse(data));

export const hello = (tabId: string): ClientFrame => ({
	t: "hello",
	protocol: PROTOCOL_VERSION,
	tabId,
});

/** Answer a blocking dialog the way the browser would, by its own method. */
export const answerTo = (question: DialogQuestion): DialogAnswer => {
	switch (question.method) {
		case "confirm":
			return { id: question.id, method: "confirm", confirmed: true };
		case "select":
			return { id: question.id, method: "select", value: question.options[0] ?? "" };
		case "input":
			return { id: question.id, method: "input", value: "" };
		case "editor":
			return { id: question.id, method: "editor", value: question.prefill ?? "" };
	}
};
