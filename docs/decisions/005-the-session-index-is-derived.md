# The session index is derived

**Decision**

A SQLite index in `<home>/.epsilon/session-index.sqlite`, with one write connection, rebuilt on any doubt. Listing is a stat, opening a chat is a byte-offset read, and the transcript arrives as a window plus history pages. The index holds sessions and their entry offsets only; the project list and the pins come from settings and `<home>/pinned-sessions.json` at read time, so they cannot disagree with what pi sees.

**Why**

pi's `listAll` parses every byte of every session file, and the old sidebar asked for it every five seconds. Reading a 46 MB session into one frame was the same mistake in another place. Cost accepted: the index reads pi's session fields directly, so a conformance test pins it to `SessionManager.listAll` and must pass after every pi upgrade. Delete the index and nothing is lost. Open: the design put the writes in a Worker; it was not built, and the sync runs in the server process, so a cold build stalls the socket (see "The index yields between slices").

**Rejected**

Caching `SessionManager.listAll` in memory (same parse, plus staleness). Writing a new session format. Keeping the index only in memory.
