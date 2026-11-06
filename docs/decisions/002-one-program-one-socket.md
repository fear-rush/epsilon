# One program, one socket

**Decision**

One Bun process serves the page and holds one WebSocket. The browser calls typed functions; there is no REST API, no OpenAPI document and no generated client.

**Why**

Epsilon runs on the same machine as the browser, so an HTTP surface would exist only for Epsilon to call itself. Effect RPC gives framing, ids, streams, interruption and typed errors over one connection, and the protocol is one schema module both sides import. Cost accepted: no curl, no third-party clients, no API docs page.

**Rejected**

Hono and `openapi-fetch`, deleted with the old tree. pi's own RPC mode (see the engine decision). A desktop shell's IPC as the first transport; it can be added later from the same definitions.
