# One name per concept across the roots

**Decision**

A concept has one name in `src/protocol/`, `src/backend/`, `src/app/features/` and the URL: `settings/mcp` everywhere, not `config` on the server and `settings` on the page.

**Why**

Two names for one thing (`config`/`settings`, `engine`/`engines`, `catalog`/`sessions`) sent agents to the wrong folder.

**Rejected**

—
