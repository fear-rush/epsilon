import { writeFileSync } from "node:fs";

import { installForceExit } from "../../src/backend/platform/signals.ts";

/**
 * A process whose shutdown waits on a child that ignores SIGTERM, for F8h.
 *
 * The handler is the server's own: the first signal only counts, the second exits. The
 * `sleep` is the engine that will not stop, so the first signal cannot finish the wait.
 */
const pidFile = process.argv[2];
if (pidFile === undefined) throw new Error("the fixture needs a pid file");

installForceExit((code) => process.exit(code));

const child = Bun.spawn(["sh", "-c", 'echo $$ > "$0"; trap "" TERM; sleep 30', pidFile], {
	stdio: ["ignore", "ignore", "ignore"],
});
writeFileSync(`${pidFile}.spawned`, `${child.pid}`);
// The wait the first signal cannot end: this is the hung finalizer.
await child.exited;
