import { docsRoutes } from "./docs";
import { Hono } from "hono";

const app = new Hono().route("/", docsRoutes).get("/health", (c) => c.json({ status: "ok" }));

export default app;
