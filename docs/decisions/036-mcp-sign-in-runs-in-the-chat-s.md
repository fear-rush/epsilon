# MCP sign-in runs in the chat's engine

**Decision**

`settings.mcp.command` sends pi's own `/mcp login|logout|reconnect <name>` line to a chat already running in the settings folder, through `Engines.command`. It refuses when no chat is open there, in pi's own words, instead of pretending it ran. The extension asks for the redirect URL through `ui.input`, which the page already draws, and opens the authorization URL on the machine running the engine.

**Why**

The connection and its OAuth state belong to the engine that holds the MCP client. A second client in the backend would open a second connection per server. The owner approved this in place of the earlier invariant ("MCP sign-in stays in the terminal"); invariant 5 now says Epsilon never writes `mcp-auth.json`.

**Rejected**

A second MCP client in the backend.
