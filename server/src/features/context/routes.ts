import { OpenAPIHono } from "@hono/zod-openapi";

import type { Deps } from "../../deps";
import { failure, toError } from "../../platform/http";
import { settingsFolder } from "../projects";
import { readContextRoute } from "./contract";
import { readContext } from "./service";

export const contextRoutes = ({ home, engines }: Deps) =>
	new OpenAPIHono().openapi(readContextRoute, async (c) => {
		let folder: string;
		try {
			folder = await settingsFolder(home, c.req.valid("query").project);
		} catch (error) {
			return failure(c, toError(error, "The project cannot be read"), 400);
		}
		try {
			return c.json(await readContext(folder, home, engines), 200);
		} catch (error) {
			return failure(c, toError(error, "The context could not be read"), 400);
		}
	});
