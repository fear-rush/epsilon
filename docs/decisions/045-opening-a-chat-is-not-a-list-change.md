# Opening a chat is not a list change

**Decision**

pi appends a `thinking_level_change` entry when an engine starts, which touched the session file and made the catalog publish a change on every chat switch. The catalog now publishes only when a field the list shows changed, and an appended chunk's activity never falls back to the file's mtime the way a whole-file parse does: only a user or assistant message moves a chat's activity. Separately, the list waits only for a folder whose trust read has never answered, not for every read that is `pending` on refetch.

**Why**

The sidebar refetched and reordered every time the reader moved between chats, for a file byte no row displays, and every open tab paid for it. Trust reads for folders pi refuses (the agent home, a folder that is gone) answer with an error, so they hold no data to keep them out of `pending`; the list waited for all of them and showed `Loading chats…`, blanking the column and replaying each row's entrance. A pending refetch and a refusal already known are not news.

**Rejected**

Dropping the change stream, which is how a message sent from a terminal reaches the list. Making the sidebar ignore changes, which would hide a real rename or a new chat. Caching the last list in a ref (reads a ref during render and lets a stale list outlive a deleted folder). Giving the trust read a `staleTime`, which would hide a trust decision made in a terminal.
