import { OpenAPIHono } from "@hono/zod-openapi";

import { failure, toError } from "../../platform/http";
import { readRegistryServerRoute, searchRegistryRoute } from "./contract";
import {
	RegistryNotFoundError,
	RegistryUnavailableError,
	readRegistryServer,
	searchRegistry,
} from "./service";
import type { Fetcher } from "./service";

/** The platform `fetch`, narrowed to what this feature passes it. */
const networkFetch: Fetcher = (url, init) => fetch(url, init);

/** Registration order is the order of the generated OpenAPI document. */
export const mcpRegistryRoutes = (fetcher: Fetcher = networkFetch) =>
	new OpenAPIHono()
		.openapi(searchRegistryRoute, async (c) => {
			try {
				return c.json(await searchRegistry(fetcher, c.req.valid("query")), 200);
			} catch (error) {
				return failure(c, toError(error, "The registry did not answer"), 502);
			}
		})
		.openapi(readRegistryServerRoute, async (c) => {
			const { source, name } = c.req.valid("query");
			try {
				return c.json(await readRegistryServer(fetcher, source, name), 200);
			} catch (error) {
				if (error instanceof RegistryNotFoundError) return failure(c, error, 404);
				if (error instanceof RegistryUnavailableError) return failure(c, error, 502);
				return failure(c, toError(error, "The registry did not answer"), 502);
			}
		});
