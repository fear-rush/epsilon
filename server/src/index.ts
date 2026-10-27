import { chatRoutes } from "./chat";
import { docsRoutes } from "./docs";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono()
	.use(cors())
	.route("/", docsRoutes)
	.route("/api", chatRoutes)
	.get("/health", (c) => c.json({ status: "ok" }));

export default app;
