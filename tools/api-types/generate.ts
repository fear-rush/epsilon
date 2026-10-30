/**
 * Turns the exported OpenAPI document into the client's path types. It is its own
 * workspace because openapi-typescript drives the TypeScript compiler API, which
 * the repo's TypeScript 7 does not ship; this package pins TypeScript 5 for it.
 */
import { resolve } from "node:path";

import openapiTS, { astToString } from "openapi-typescript";
import type { OpenAPI3 } from "openapi-typescript";

const apiDir = resolve(import.meta.dirname, "../../client/src/api");
const document: OpenAPI3 = await Bun.file(resolve(apiDir, "openapi.json")).json();

const banner = "/** Generated from openapi.json by `bun run api:generate`. Do not edit. */\n\n";

await Bun.write(resolve(apiDir, "schema.gen.ts"), banner + astToString(await openapiTS(document)));
