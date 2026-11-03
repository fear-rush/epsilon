import { test } from "bun:test";

/**
 * The Phase 0 bugs (`.sandbox/refactor/02-phase0-fixes.md`) as acceptance tests.
 *
 * They are `todo` until the code they describe exists: each names the step that must make
 * it pass, and the behaviour the new design has to produce, not the old patch.
 */

test.todo("F1: moving a chat whose engine is running is refused and the file is untouched", () => {
	// Step 4. The move goes through the registry's lock, so a running session answers
	// SESSION_RUNNING instead of being forked and removed under the engine.
});

test.todo("F2: an extension whose session_shutdown rejects does not take the server down", () => {
	// Step 5. The handler runs in the engine process; its crash costs that chat, and the
	// server keeps answering.
});

test.todo("F3: disposing an engine does not forget the engine that replaced it", () => {
	// Step 5. Close during a slow shutdown, re-attach, then exactly one engine exists and
	// the shutdown sweep closes it.
});

test.todo("F4: no test type-checks or lists sessions from the real home", () => {
	// Step 3. The preload sets a scratch home (already enforced above); the catalog
	// conformance test calls listAll only through it.
});

test.todo("F5: a 50,000-entry linear chat opens and its tree renders", () => {
	// Steps 2 and 8. The tree arrives flat, so neither schema validation nor rendering
	// recurses with depth.
});

test.todo("F6: a prompt sent while an agent_settled handler is slow answers instead of hanging", () => {
	// Step 5. The command resolves when pi accepts it, and the run has an acceptance
	// deadline, so `dispatching` cannot stay true forever.
});

test.todo("F8a: a runtime that fails to wire is closed before the error is reported", () => {
	// Step 5. Opening a session is acquireRelease: a failed wire releases the runtime.
});

test.todo("F8e: a timed-out skill import kills the whole process group", () => {
	// Step 6. The CLI runs detached; the deadline kills the group and the request fails
	// with a notice instead of hanging on open pipes.
});

test.todo("F8f: a command typed while reconnecting is queued or refused visibly", () => {
	// Step 8. The runtime queues commands during reconnect and shows them once attached.
});

test.todo("F8h: a second process signal exits even when an engine ignores shutdown", () => {
	// Step 7. Shutdown has a deadline and a forced exit; a hung child cannot block Ctrl-C.
});

test.todo("F8m: notices are capped so a looping extension cannot grow the transcript", () => {
	// Step 2. The reducer keeps the newest notices and counts what it dropped.
});
