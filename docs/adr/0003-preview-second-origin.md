# ADR-0003: Serve preview content from a second origin

- Status: Accepted
- Date: 2026-10-28

## Context

The preview pane shows HTML files and dev servers that the agent writes. That
content is untrusted: a model produced it, and it can contain any script.

The API holds a socket that controls agent children and reads project files. A
preview frame on the API origin, with `allow-same-origin`, can call the API and
open that socket. A path prefix does not isolate cookies or storage, because the
origin is the same.

## Decision

1. Serve preview content from a second listener on its own port.
2. The API origin and the preview origin share no cookie, storage or CORS grant.
3. Render the preview in an iframe with `sandbox` and without `allow-same-origin`.
4. The preview listener serves static files and proxies a dev server. It does not
   import the API app.
5. A preview that cannot load shows a visible notice. It never falls back to the
   API origin.

## Consequences

- Preview code cannot read `/api` and cannot open the socket.
- `server/src/config.ts` carries two ports.
- Hot reload through the dev-server proxy needs WebSocket upgrade passthrough.
  Without it, hot reload fails silently. The proxy is its own step in S9.
- A full-page preview needs a second URL.

## Rejected alternatives

- **A path prefix on the API origin.** Cheapest to build. Rejected: the origin is
  the same, so a sandboxed frame with `allow-same-origin` reads the API, and a
  path prefix gives no storage isolation.
- **A content security policy alone.** Rejected: one incorrect header, or one
  `blob:` URL, removes the protection, and a same-origin `fetch` still reaches the
  API.
- **A separate process.** Rejected: the preview needs no isolation beyond the
  origin, and a second process adds a lifecycle to manage.

## Revisit if

- The preview needs a documented read-only API.
- pi exposes a sandbox for agent-written content.
