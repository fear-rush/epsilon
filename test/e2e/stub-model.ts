import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

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

export async function startStubModel(
	replies: ReadonlyArray<string> = ["stub reply"],
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
		const reply = replies[next % replies.length] ?? "stub reply";
		next++;
		response.writeHead(200, {
			"cache-control": "no-cache",
			connection: "keep-alive",
			"content-type": "text/event-stream",
		});
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
