# The tree travels on demand

**Decision**

The snapshot carries the window, notices and the session id; the flat branch tree is sent only when a tab asks (`loadTree`), as one `tree` frame. The picker asks when it opens, and the jump rail asks when its loaded window has fewer than five user turns, so a long assistant reply cannot hide the rail. Each row carries what main's picker needs (`kind`, `text`, `hasText`, `label`, `active`, `current`), and a row pi's default view hides names its nearest kept ancestor as `parentId`. The reducer nests them in one pass when the frame arrives, so the wire stays non-recursive and main's filter and tree dialog port unchanged.

**Why**

The old snapshot held the whole transcript and a recursive tree, 46 MB for a 46 MB file (F5). 50,000 rows in every snapshot would exceed the 2 MB frame budget and re-send what the picker already has.

**Rejected**

A recursive tree schema; a window that includes the tree; a tree endpoint separate from the conversation stream.
