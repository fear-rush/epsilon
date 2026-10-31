/**
 * Where the dev sandbox lives. pi walks up from a chat's folder: it loads every
 * `AGENTS.md`/`CLAUDE.md` up to `/` and every `.agents/skills` up to the git root.
 * A sandbox inside this repository would load the repository's own, and one under
 * the operator's `~` would load theirs, so the data lives where no ancestor holds
 * either. `.sandbox` in the repository is a link to it, for browsing.
 *
 * Run directly with `clean` to delete it (`bun run sandbox:clean`).
 */
import {
	cpSync,
	existsSync,
	lstatSync,
	renameSync,
	rmSync,
	symlinkSync,
	unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

/** The link inside the repository. */
export const sandboxLink = join(repoRoot, ".sandbox");

/** The sandbox itself: macOS's shared folder, else the reboot-safe temp folder. */
export const sandboxRoot =
	process.platform === "darwin" ? "/Users/Shared/epsilon-sandbox" : "/var/tmp/epsilon-sandbox";

/**
 * Points `.sandbox` at the sandbox. A `.sandbox` from before the move is a real
 * folder; it becomes the sandbox, so its sessions and settings survive.
 */
export const linkSandbox = (): void => {
	if (existsSync(sandboxLink) && !lstatSync(sandboxLink).isSymbolicLink()) {
		if (existsSync(sandboxRoot)) {
			throw new Error(`Both ${sandboxLink} and ${sandboxRoot} exist; remove one and rerun`);
		}
		try {
			renameSync(sandboxLink, sandboxRoot);
		} catch {
			// Another volume: copy, then remove the original.
			cpSync(sandboxLink, sandboxRoot, { recursive: true });
			rmSync(sandboxLink, { recursive: true, force: true });
		}
		console.log(`dev: moved ${sandboxLink} -> ${sandboxRoot}`);
	}
	if (lstatSync(sandboxLink, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(sandboxLink);
	symlinkSync(sandboxRoot, sandboxLink);
};

if (import.meta.main && process.argv[2] === "clean") {
	rmSync(sandboxRoot, { recursive: true, force: true });
	if (lstatSync(sandboxLink, { throwIfNoEntry: false }) !== undefined) {
		rmSync(sandboxLink, { recursive: true, force: true });
	}
	console.log(`sandbox: removed ${sandboxRoot}`);
}
