import { Hono } from "hono";
import { Scalar } from "@scalar/hono-api-reference";
import { openApiDocument } from "./openapi";

export const docsRoutes = new Hono()
	.get("/openapi.json", (c) => c.json(openApiDocument))
	.get("/scalar", Scalar({ url: "/openapi.json", pageTitle: "API reference" }));
