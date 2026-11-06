# The sidebar pages its lists

**Decision**

The session column shows ten Projects, ten Chats and ten chats inside an expanded project; `Load more` adds ten to that list. Pinned chats keep their place at the top of Chats. Projects are ordered by the newest chat activity in the folder, not by name, because a project is derived from its sessions' `cwd` and activity is the only recency it has. Search reads the whole list and shows every match, so a page never hides a chat from a search.

**Why**

The operator's real home held 73 project folders, one of them with 103 chats. Alphabetical projects put `.agents` and `.pi` above the work, and the column was a wall.

**Rejected**

Server-side paging, a protocol change that duplicates the grouping and trust reads for a few hundred rows. A stored project list; pi has no project record.
