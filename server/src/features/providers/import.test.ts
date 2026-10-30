/**
 * The model list is Epsilon's own HTTP call, so this test runs a loopback list.
 * A gateway that says a model only accepts Anthropic Messages must get a
 * per-model API and a base above `/v1`, or the model is saved with the wrong
 * shape and refuses every request.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { importModelsForHome } from "./import";

const servers: { stop: (force?: boolean) => void }[] = [];

afterEach(() => {
	for (const server of servers) server.stop(true);
	servers.length = 0;
});

describe("model list import", () => {
	test("marks models that only speak Anthropic Messages", async () => {
		const server = Bun.serve({
			port: 0,
			fetch() {
				return Response.json({
					data: [
						{ id: "gpt", name: "GPT", supported_endpoints: ["/chat/completions", "/responses"] },
						{
							id: "claude-sonnet-5-5",
							name: "Claude",
							supported_endpoints: ["/messages"],
						},
						{ id: "both", supported_endpoints: ["/chat/completions", "/messages"] },
						{ id: "responses-only", supported_endpoints: ["/responses"] },
						{ id: "unknown" },
					],
				});
			},
		});
		servers.push(server);

		const home = agentHome(await mkdtemp(join(tmpdir(), "epsilon-import-list-")));
		const base = `http://127.0.0.1:${server.port}/provider/v1`;
		const models = await importModelsForHome(home, {
			baseUrl: base,
			api: "openai-completions",
			apiKey: "test",
		});

		const byId = new Map(models.map((model) => [model.id, model]));
		expect(byId.get("gpt")).toEqual({ id: "gpt", name: "GPT" });
		expect(byId.get("both")).toEqual({ id: "both" });
		expect(byId.get("responses-only")).toEqual({ id: "responses-only", api: "openai-responses" });
		expect(byId.get("unknown")).toEqual({ id: "unknown" });

		const claude = byId.get("claude-sonnet-5-5");
		expect(claude?.api).toBe("anthropic-messages");
		expect(claude?.baseUrl).toBe(`http://127.0.0.1:${server.port}/provider`);
		// pi's catalog knows this id: capability, level map and adaptive switch.
		expect(claude?.reasoning).toBe(true);
		expect(claude?.thinkingLevelMap?.low).toBe("low");
		expect(claude?.thinkingLevelMap?.max).toBe("max");
		expect(claude?.compat?.forceAdaptiveThinking).toBe(true);
	});
});
