// Update this document when API routes change. It is generated from
// `createRoute` schemas once the REST surface lands (see docs/architecture.md);
// until then it describes the routes that exist.
export const openApiDocument = {
	openapi: "3.1.0",
	info: {
		title: "epsilon API",
		version: "0.0.1",
		description:
			"Local API for the epsilon dashboard. Agent control and transcripts travel over the WebSocket described in docs/protocol.md, not over these routes.",
	},
	paths: {
		"/health": {
			get: {
				operationId: "health",
				tags: ["meta"],
				responses: {
					"200": {
						description: "Server is running",
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["status"],
									properties: {
										status: { type: "string", enum: ["ok"] },
									},
								},
							},
						},
					},
				},
			},
		},
	},
};
