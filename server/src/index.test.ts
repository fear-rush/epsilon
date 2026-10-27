import { expect, test } from "bun:test";
import app from "./index";

test("health endpoint responds", async () => {
	const response = await app.request("/health");
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ status: "ok" });
});
