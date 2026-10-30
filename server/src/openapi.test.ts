import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { contractId, openApiDocument } from "./openapi";
import { renderApiTypes } from "./openapi-types";

const apiDir = resolve(import.meta.dirname, "../../client/src/api");

test("the client was generated from the current REST contract", async () => {
	const generated = await readFile(resolve(apiDir, "contract.gen.ts"), "utf8");
	expect(
		generated,
		"client/src/api/contract.gen.ts is stale: run `bun run api:generate`",
	).toContain(`"${contractId(openApiDocument())}"`);
});

test("the committed OpenAPI document is the current one", async () => {
	const committed = await readFile(resolve(apiDir, "openapi.json"), "utf8");
	expect(
		contractId(JSON.parse(committed)),
		"client/src/api/openapi.json is stale: run `bun run api:generate`",
	).toBe(contractId(openApiDocument()));
});

test("the committed client types are the ones the document generates", async () => {
	const [document, types] = await Promise.all([
		readFile(resolve(apiDir, "openapi.json"), "utf8"),
		readFile(resolve(apiDir, "schema.gen.ts"), "utf8"),
	]);
	expect(types, "client/src/api/schema.gen.ts is stale: run `bun run api:generate`").toBe(
		renderApiTypes(document),
	);
});

test("the type generator refuses a JSON Schema keyword it does not know", () => {
	const document = JSON.stringify({
		paths: {},
		components: { schemas: { Odd: { type: "object", patternProperties: {} } } },
	});
	expect(() => renderApiTypes(document)).toThrow();
});

test("the contract id ignores key order and changes with content", () => {
	const document = openApiDocument();
	const { openapi, info, paths } = document;
	expect(contractId({ openapi, info, paths })).toBe(contractId({ paths, info, openapi }));
	expect(contractId({ ...document, info: { ...document.info, version: "9.9.9" } })).not.toBe(
		contractId(document),
	);
});
