/**
 * A real MCP server over stdio, for the end-to-end suite. It is not a mock of
 * anything Epsilon owns: the server process speaks the same JSON-RPC protocol a
 * published MCP server does, so the dashboard's connection, tool discovery and
 * per-tool rules run against a real client/server pair.
 *
 * One tool, `echo`, echoes its `text` argument. Newline-delimited JSON-RPC, as
 * pi's `StdioTransport` writes and reads it.
 */
const PROTOCOL_VERSION = "2025-11-25";

const TOOL = {
	name: "echo",
	description: "Echo the text it is given.",
	inputSchema: {
		type: "object",
		properties: { text: { type: "string", description: "The text to echo." } },
		required: ["text"],
		additionalProperties: false,
	},
} as const;

type Request = { jsonrpc: "2.0"; id?: string | number; method: string; params?: unknown };

type InitializeResult = {
	protocolVersion: string;
	capabilities: { tools: { listChanged: boolean } };
	serverInfo: { name: string; version: string; title: string };
	instructions: string;
};
type ToolListResult = { tools: (typeof TOOL)[] };
type ToolCallResult = { content: { type: "text"; text: string }[]; isError: boolean };
type RpcResult =
	| InitializeResult
	| ToolListResult
	| ToolCallResult
	| { resources: [] }
	| { resourceTemplates: [] }
	| { prompts: [] }
	| Record<string, never>;

const reply = (id: string | number | undefined, result: RpcResult): void => {
	if (id === undefined) return;
	process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
};

const fail = (id: string | number | undefined, code: number, message: string): void => {
	if (id === undefined) return;
	process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
};

const answer = (request: Request): void => {
	const { id, method, params } = request;
	switch (method) {
		case "initialize":
			reply(id, {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: "e2e-mcp", version: "1.0.0", title: "E2E fixture server" },
				instructions: "The end-to-end fixture server exposes one echo tool.",
			});
			return;
		case "tools/list":
			reply(id, { tools: [TOOL] });
			return;
		case "tools/call": {
			// SAFETY: the client sends MCP tool-call params; this server answers `echo`
			// and only reads the text argument it documents.
			const call = params as { name?: string; arguments?: { text?: string } } | undefined;
			if (call?.name !== "echo") {
				fail(id, -32602, `Unknown tool: ${String(call?.name)}`);
				return;
			}
			reply(id, {
				content: [{ type: "text", text: `echo: ${call.arguments?.text ?? ""}` }],
				isError: false,
			});
			return;
		}
		case "resources/list":
			reply(id, { resources: [] });
			return;
		case "resources/templates/list":
			reply(id, { resourceTemplates: [] });
			return;
		case "prompts/list":
			reply(id, { prompts: [] });
			return;
		case "ping":
			reply(id, {});
			return;
		default:
			fail(id, -32601, `Method not found: ${method}`);
	}
};

const main = async (): Promise<void> => {
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of Bun.stdin.stream()) {
		buffer += decoder.decode(chunk, { stream: true });
		let newline = buffer.indexOf("\n");
		while (newline >= 0) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (line !== "") {
				try {
					// SAFETY: every line the client writes is one JSON-RPC message.
					answer(JSON.parse(line) as Request);
				} catch {
					// A malformed line is the client's bug; this server has no request id to answer.
				}
			}
			newline = buffer.indexOf("\n");
		}
	}
};

await main();
