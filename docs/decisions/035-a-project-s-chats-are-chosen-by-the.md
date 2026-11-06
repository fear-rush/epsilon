# A project's chats are chosen by the server

**Decision**

`sessions.removeProject` takes a folder, asks the index which chats ran in it, checks every one for a live engine, and only then deletes the files and their pins. The page passes the folder's path and no list.

**Why**

The page's rows can be a refetch behind the files. A loop of `sessions.remove` from the page deleted the chats it happened to know about and then failed on the one that was still open, so a project could be left half deleted, where main's route refused the whole answer before touching a file. Cost accepted: the sidebar's "N chats" sentence comes from the same list, so a chat a terminal pi wrote after that refetch is deleted without being counted there.

**Rejected**

A per-chat loop on the page. Deleting from a list the page supplies.
