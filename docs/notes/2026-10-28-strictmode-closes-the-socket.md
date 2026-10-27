# StrictMode leaves the rendered page on a closed socket

Date: 2026-10-28

## Symptom

The page stays on "connecting" with "No messages yet" while the server has
already sent a full snapshot. The socket log shows one connection failing with
`WebSocket is closed before the connection is established` and a second one that
receives `welcome`, `meta`, `snapshot` and events. Nothing in the transcript
moves.

## Cause

`useConversation` created its store inside `useState` and closed it from an
effect cleanup. StrictMode runs the initializer twice and mounts, unmounts and
remounts the effect. One store is discarded, the other is closed, and the store
the page renders is not the store that receives frames. The guard in `link.ts`
only covers two sockets inside the same `Link`, so it cannot see this.

A second consequence: the discarded store had already attached with a fresh
random session id, so each mount spawned a second `pi` child for a session
nobody would ever open.

## Fix

Hold stores in a module-level map keyed by session id, with one fresh session id
per page load. Both StrictMode invocations then resolve to the same store and the
same socket. The store no longer closes itself; the tab's lifetime is the
socket's lifetime.

## Check

Open `/?session=<id>` in development, where StrictMode is on. The header shows
`open` and the transcript renders, with exactly one `/api/link` socket in the
network log.
