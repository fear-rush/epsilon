import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

import { Option, Schema } from "effect";

/**
 * A local OpenAI-compatible endpoint for e2e runs: deterministic, offline, scripted.
 *
 * It is built on `node:http` rather than `Bun.serve` because Playwright runs its workers
 * under Node, where `Bun` does not exist. It streams one assistant turn per request.
 */

export type StubModel = {
	readonly baseUrl: string;
	stop(): void;
};

const sse = (chunk: unknown): string => `data: ${JSON.stringify(chunk)}\n\n`;

/** What the request's messages say, as much as the stub needs to script a turn. */
type Turn = {
	/** The user's words, so a scripted prompt can choose its answer. */
	readonly lastUser: string;
	/** A tool result came back, so the answer to the tool is due. */
	readonly afterTool: boolean;
};

const Message = Schema.Struct({
	role: Schema.optional(Schema.String),
	content: Schema.optional(Schema.Unknown),
});
const Body = Schema.Struct({ messages: Schema.optional(Schema.Array(Message)) });
const decodeBody = Schema.decodeUnknownOption(Schema.fromJsonString(Body));

const TextBlock = Schema.Struct({ text: Schema.optional(Schema.String) });

/** The words of a message's content: a string, or text blocks joined. */
const wordsOf = (content: unknown): string => {
	const plain = Schema.decodeUnknownOption(Schema.String)(content);
	if (Option.isSome(plain)) return plain.value;
	const blocks = Schema.decodeUnknownOption(Schema.Array(TextBlock))(content);
	if (Option.isNone(blocks)) return "";
	return blocks.value.map((block) => block.text ?? "").join(" ");
};

const turnOf = (body: string): Turn => {
	const parsed = decodeBody(body);
	if (Option.isNone(parsed)) return { afterTool: false, lastUser: "" };
	const messages = parsed.value.messages ?? [];
	const last = messages.at(-1);
	const user = messages.findLast((message) => message.role === "user");
	return { afterTool: last?.role === "tool", lastUser: wordsOf(user?.content) };
};

/** One assistant turn that calls `discuss`, so the page has a question to answer. */
const toolCallTurn = (): ReadonlyArray<unknown> => [
	{
		choices: [{ delta: { role: "assistant" }, index: 0 }],
		id: "stub-tool",
		object: "chat.completion.chunk",
	},
	{
		choices: [
			{
				delta: {
					tool_calls: [
						{
							function: {
								arguments: JSON.stringify({
									options: [{ label: "Yes" }, { label: "No" }],
									question: "Continue with the extension?",
								}),
								name: "discuss",
							},
							id: "call_discuss",
							index: 0,
							type: "function",
						},
					],
				},
				index: 0,
			},
		],
		id: "stub-tool",
		object: "chat.completion.chunk",
	},
	{
		choices: [{ delta: {}, finish_reason: "tool_calls", index: 0 }],
		id: "stub-tool",
		object: "chat.completion.chunk",
	},
];

export type StubOptions = {
	/** Wait before the first chunk, so a test can tell "accepted" from "finished". */
	readonly delayMs?: number;
};

export async function startStubModel(
	replies: ReadonlyArray<string> = ["stub reply"],
	options: StubOptions = {},
): Promise<StubModel> {
	let next = 0;
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		if (url.pathname === "/v1/models") {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ data: [{ id: "stub-model", object: "model" }] }));
			return;
		}
		if (url.pathname !== "/v1/chat/completions" || request.method !== "POST") {
			response.writeHead(404);
			response.end("not found");
			return;
		}
		const chunks: string[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));
		request.on("end", () => {
			const turn = turnOf(chunks.join(""));
			// "run the extension" is the dialog flow's prompt: the model asks the user a
			// question first, then answers once the tool result is back.
			const asks = turn.lastUser.includes("run the extension") && !turn.afterTool;
			const delay = options.delayMs ?? 0;
			setTimeout(() => {
				response.writeHead(200, {
					"cache-control": "no-cache",
					connection: "keep-alive",
					"content-type": "text/event-stream",
				});
				if (asks) {
					for (const chunk of toolCallTurn()) response.write(sse(chunk));
					response.end("data: [DONE]\n\n");
					return;
				}
				const reply = replies[next % replies.length] ?? "stub reply";
				next++;
				response.write(
					sse({
						choices: [{ delta: { role: "assistant" }, index: 0 }],
						id: "stub",
						object: "chat.completion.chunk",
					}),
				);
				for (const word of reply.split(" ")) {
					response.write(
						sse({
							choices: [{ delta: { content: `${word} ` }, index: 0 }],
							id: "stub",
							object: "chat.completion.chunk",
						}),
					);
				}
				response.write(
					sse({
						choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
						id: "stub",
						object: "chat.completion.chunk",
					}),
				);
				response.end("data: [DONE]\n\n");
			}, delay);
		});
	});

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string")
		throw new Error("stub model did not bind a port");
	return {
		baseUrl: `http://127.0.0.1:${address.port}/v1`,
		stop: () => {
			server.close();
		},
	};
}

/** Writes the `models.json` an agent home needs to reach the stub. */
export function writeStubModels(agentHome: string, baseUrl: string): void {
	mkdirSync(agentHome, { recursive: true });
	writeFileSync(
		join(agentHome, "models.json"),
		`${JSON.stringify(
			{
				providers: {
					stub: {
						name: "Stub",
						baseUrl,
						api: "openai-completions",
						apiKey: "stub-key",
						models: [{ id: "stub-model", name: "Stub Model" }],
					},
				},
			},
			null,
			2,
		)}\n`,
	);
}
