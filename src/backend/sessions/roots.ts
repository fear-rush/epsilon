import { Effect } from "effect";

import type { AgentHomeApi } from "../platform/agent-home.ts";
import { sessionDirOf } from "../platform/pi.ts";
import type { CatalogApi } from "./catalog.ts";

/**
 * Where the index looks for session files. pi writes them under the home's `sessions/`
 * by default, and a settings file can move them: `sessionDir` is resolved per folder, so
 * a project that set one keeps writing there.
 *
 * A folder that moved its sessions is only discoverable from a chat's recorded cwd, so
 * the default root is synced first and the folders its rows name are synced after. That
 * second pass is also what prunes a deleted chat out of a custom folder.
 */
export const syncSessionRoots = (catalog: CatalogApi, home: AgentHomeApi): Effect.Effect<void> =>
	Effect.gen(function* () {
		// The home's own chats run in `chatsDir`, so its `sessionDir` decides their folder.
		const homeDir = sessionDirOf(home.chatsDir, home).dir;
		const roots = homeDir === home.sessionsDir ? [home.sessionsDir] : [home.sessionsDir, homeDir];
		yield* catalog.sync(roots);
		const moved = [...new Set((yield* catalog.list).map((row) => sessionDirOf(row.cwd, home).dir))];
		const extra = moved.filter((dir) => !roots.includes(dir));
		if (extra.length === 0) return;
		yield* catalog.sync(extra);
	});
