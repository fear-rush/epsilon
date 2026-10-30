/**
 * The provider test is a real HTTP call through pi's client. These checks run a
 * loopback endpoint and read the request pi sent, so a draft that the form has
 * not saved is what gets tried (ADR-0012).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { testProviderForHome } from "./test-provider";

type Seen = {
	path: string;
	authorization: string | null;
	draft: string | null;
	model: unknown;
	effort: unknown;
};

const servers: { stop: (force?: boolean) => void }[] = [];

afterEach(() => {
	for (const server of servers) server.stop(true);
	servers.length = 0;
});

const home = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), "epsilon-provider-test-"));
	await writeFile(join(root, "models.json"), JSON.stringify({ providers: {} }));
	return root;
};

const openaiStream = (model: string): string =>
	[
		`data: ${JSON.stringify({
			id: "chatcmpl-test",
			object: "chat.completion.chunk",
			created: 0,
			model,
			choices: [{ index: 0, delta: { role: "assistant", content: "ok" }, finish_reason: null }],
		})}`,
		"",
		`data: ${JSON.stringify({
			id: "chatcmpl-test",
			object: "chat.completion.chunk",
			created: 0,
			model,
			choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
			usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
		})}`,
		"",
		"data: [DONE]",
		"",
	].join("\n");

describe("provider test", () => {
	test("tries the unsaved draft and reports the model", async () => {
		const seen: Seen[] = [];
		const server = Bun.serve({
			port: 0,
			async fetch(request) {
				// SAFETY: the loopback endpoint only ever receives the JSON this test sends.
				const body = (await request.json()) as { model?: unknown; reasoning_effort?: unknown };
				seen.push({
					path: new URL(request.url).pathname,
					authorization: request.headers.get("authorization"),
					draft: request.headers.get("x-draft"),
					model: body.model,
					effort: body.reasoning_effort,
				});
				return new Response(openaiStream("m"), {
					headers: { "content-type": "text/event-stream" },
				});
			},
		});
		servers.push(server);

		const root = await home();
		const result = await testProviderForHome(root, {
			providerId: "draft",
			baseUrl: `http://127.0.0.1:${server.port}/v1`,
			api: "openai-completions",
			apiKey: "typed-key",
			headers: { "X-Draft": "yes" },
			model: { id: "m" },
		});

		expect(result.message).toContain("Reached draft/m with the typed key");
		expect(result.message).toContain("also answers without a key");
		expect(seen).toHaveLength(2);
		const keyed = seen.find((request) => request.authorization === "Bearer typed-key");
		const keyless = seen.find((request) => request.authorization === null);
		expect(keyed?.path).toBe("/v1/chat/completions");
		expect(keyed?.draft).toBe("yes");
		expect(keyed?.model).toBe("m");
		expect(keyless?.path).toBe("/v1/chat/completions");
		expect(keyless?.draft).toBe("yes");
		expect(keyless?.model).toBe("m");
	});

	test("without a key it probes the endpoint keylessly", async () => {
		const seen: Seen[] = [];
		const server = Bun.serve({
			port: 0,
			async fetch(request) {
				// SAFETY: the loopback endpoint only ever receives the JSON this test sends.
				const body = (await request.json()) as { model?: unknown; reasoning_effort?: unknown };
				seen.push({
					path: new URL(request.url).pathname,
					authorization: request.headers.get("authorization"),
					draft: request.headers.get("x-draft"),
					model: body.model,
					effort: body.reasoning_effort,
				});
				return new Response(openaiStream("m"), {
					headers: { "content-type": "text/event-stream" },
				});
			},
		});
		servers.push(server);

		const root = await home();
		const result = await testProviderForHome(root, {
			providerId: "draft",
			baseUrl: `http://127.0.0.1:${server.port}/v1`,
			api: "openai-completions",
			headers: { "X-Draft": "yes" },
			model: { id: "m" },
		});

		expect(result.message).toContain("without an API key");
		expect(seen).toHaveLength(1);
		expect(seen[0]?.authorization).toBeNull();
		expect(seen[0]?.draft).toBe("yes");
	});

	test("a filled key that fails is reported although the endpoint works keyless", async () => {
		const server = Bun.serve({
			port: 0,
			fetch(request) {
				if (request.headers.get("authorization") !== null) {
					return new Response(JSON.stringify({ error: { message: "bad key" } }), {
						status: 401,
						headers: { "content-type": "application/json" },
					});
				}
				return new Response(openaiStream("m"), {
					headers: { "content-type": "text/event-stream" },
				});
			},
		});
		servers.push(server);

		const root = await home();
		await expect(
			testProviderForHome(root, {
				providerId: "draft",
				baseUrl: `http://127.0.0.1:${server.port}/v1`,
				api: "openai-completions",
				apiKey: "wrong",
				model: { id: "m" },
			}),
		).rejects.toThrow(/failed with the typed key/u);
	});

	test("a literal key with an inner space is refused", async () => {
		const root = await home();
		await expect(
			testProviderForHome(root, {
				providerId: "draft",
				baseUrl: "http://127.0.0.1:9/v1",
				api: "openai-completions",
				apiKey: "secret key",
				model: { id: "m" },
			}),
		).rejects.toThrow(/cannot contain spaces/u);
	});

	test("a key with a pasted line break is refused", async () => {
		const root = await home();
		await expect(
			testProviderForHome(root, {
				providerId: "draft",
				baseUrl: "http://127.0.0.1:9/v1",
				api: "openai-completions",
				apiKey: "secret\n",
				model: { id: "m" },
			}),
		).rejects.toThrow(/spaces or line breaks/u);
	});

	test("a level is sent and its reasoning tokens are reported", async () => {
		const seen: Seen[] = [];
		const server = Bun.serve({
			port: 0,
			async fetch(request) {
				// SAFETY: the loopback endpoint only ever receives the JSON this test sends.
				const body = (await request.json()) as { model?: unknown; reasoning_effort?: unknown };
				seen.push({
					path: new URL(request.url).pathname,
					authorization: request.headers.get("authorization"),
					draft: null,
					model: body.model,
					effort: body.reasoning_effort,
				});
				const reasoning = [
					`data: ${JSON.stringify({
						id: "chatcmpl-test",
						object: "chat.completion.chunk",
						created: 0,
						model: "m",
						choices: [
							{
								index: 0,
								delta: { role: "assistant", reasoning_content: "abc" },
								finish_reason: null,
							},
						],
					})}`,
					"",
					`data: ${JSON.stringify({
						id: "chatcmpl-test",
						object: "chat.completion.chunk",
						created: 0,
						model: "m",
						choices: [
							{
								index: 0,
								delta: { content: "ok" },
								finish_reason: "stop",
							},
						],
						usage: {
							prompt_tokens: 3,
							completion_tokens: 8,
							total_tokens: 11,
							completion_tokens_details: { reasoning_tokens: 7 },
						},
					})}`,
					"",
					"data: [DONE]",
					"",
				].join("\n");
				return new Response(reasoning, {
					headers: { "content-type": "text/event-stream" },
				});
			},
		});
		servers.push(server);

		const root = await home();
		const result = await testProviderForHome(root, {
			providerId: "draft",
			baseUrl: `http://127.0.0.1:${server.port}/v1`,
			api: "openai-completions",
			apiKey: "typed-key",
			level: "high",
			model: { id: "m", reasoning: true },
		});

		expect(result.message).toContain("at high");
		expect(result.message).toContain("7 reasoning tokens");
		const keyed = seen.find((request) => request.authorization === "Bearer typed-key");
		expect(keyed?.effort).toBe("high");
	});

	test("a refused request is an error with the provider's answer", async () => {
		const server = Bun.serve({
			port: 0,
			fetch() {
				return new Response(JSON.stringify({ error: { message: "bad key" } }), {
					status: 401,
					headers: { "content-type": "application/json" },
				});
			},
		});
		servers.push(server);

		const root = await home();
		await expect(
			testProviderForHome(root, {
				providerId: "draft",
				baseUrl: `http://127.0.0.1:${server.port}/v1`,
				api: "openai-completions",
				apiKey: "wrong",
				model: { id: "m" },
			}),
		).rejects.toThrow();
	});
});
