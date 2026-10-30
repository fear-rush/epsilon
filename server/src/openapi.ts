/**
 * The OpenAPI document is the one REST contract: the client's types are generated
 * from it, and its hash travels on every response so the browser can tell that it
 * is older than the server.
 */
import { createHash } from "node:crypto";

import { SessionRegistry } from "./features/conversation/registry";
import { agentHome } from "./platform/agent-home";
import { mountRoutes } from "./routes";

const info = {
	title: "epsilon API",
	version: "0.0.1",
	description: "Local REST surface for sessions and for configuring the agent.",
};

export type OpenApiDocument = ReturnType<ReturnType<typeof mountRoutes>["getOpenAPI31Document"]>;

/**
 * The document needs the routes' shapes, never their handlers, so it is built from
 * a registry that holds no engine. No request ever reaches these paths.
 */
export const openApiDocument = (): OpenApiDocument => {
	const home = agentHome("/epsilon-openapi");
	const engines = new SessionRegistry({ cwd: home.dir, home });
	return mountRoutes({ home, projectDir: home.dir, engines }, () => "").getOpenAPI31Document({
		openapi: "3.1.0",
		info,
	});
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Writes every object with its keys in sorted order, so key order cannot change the id. */
const sortKeys = (_key: string, value: Json): Json =>
	value instanceof Object && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value).toSorted(([a], [b]) => (a < b ? -1 : 1)))
		: value;

/** Sixteen hex digits that change whenever the REST contract does. */
export const contractId = (document: OpenApiDocument): string =>
	createHash("sha256").update(JSON.stringify(document, sortKeys)).digest("hex").slice(0, 16);

let current: string | undefined;

/** The id of this server's own document, computed once. */
export const currentContractId = (): string => (current ??= contractId(openApiDocument()));
