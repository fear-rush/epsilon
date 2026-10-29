import type { Context } from "hono";

import { registry } from "../runtime";
import { failure, toError } from "./failure";

/**
 * One settings write: run it, reload every live engine, answer 204. A refusal is
 * one sentence with status 400. Every settings route goes through here, so the
 * reload and the error shape cannot drift between resources.
 */
export const settingsWrite = async (
	c: Context,
	write: () => Promise<void> | void,
): Promise<Response> => {
	try {
		await write();
		registry.reloadAll();
		return c.body(null, 204);
	} catch (error) {
		return failure(c, toError(error, "The settings change failed"), 400);
	}
};
