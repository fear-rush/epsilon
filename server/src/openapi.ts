// Update this document when API routes change.
export const openApiDocument = {
	openapi: "3.1.0",
	info: {
		title: "API",
		version: "1.0.0",
	},
	paths: {
		"/api/chat": {
			post: {
				operationId: "chat",
				description:
					"Streams an assistant reply as a UI message stream. Requires COMMANDCODE_API_KEY.",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["messages"],
								properties: {
									model: {
										type: "string",
										description:
											"Model id from CHAT_MODELS in shared/src/chat.ts. Defaults to the first entry.",
									},
									messages: {
										type: "array",
										items: { type: "object" },
										description: "AI SDK UI messages.",
									},
								},
							},
						},
					},
				},
				responses: {
					"200": {
						description: "UI message stream",
						content: {
							"text/event-stream": { schema: { type: "string" } },
						},
					},
					"400": {
						description: "Invalid request body, messages, or model",
					},
					"503": {
						description: "COMMANDCODE_API_KEY is not set",
					},
				},
			},
		},
		"/health": {
			get: {
				operationId: "health",
				responses: {
					"200": {
						description: "Server is running",
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["status"],
									properties: {
										status: {
											type: "string",
											const: "ok",
										},
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
