/**
 * The file-level rules a skill bundle must pass before Epsilon installs it. They
 * are pure, so the browser can refuse an oversized or unsafe folder before it
 * uploads a byte, and the server runs the very same checks on what arrives.
 */

/** A skill folder holds at most this many files. */
export const IMPORT_MAX_FILES = 500;
/** A skill folder unpacks to at most this many bytes. */
export const IMPORT_MAX_SKILL_BYTES = 25 * 1024 * 1024;
/** An upload, a folder's files together or one archive, is at most this many bytes. */
export const IMPORT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/** `SKILL.md` longer than this is legal, but pi loads all of it into context. */
export const SKILL_BODY_ADVISED_LINES = 500;

/** One thing wrong, or worth knowing, about a skill in an import. */
export type SkillIssue = {
	/** A stable tag the panel can switch on. */
	code: string;
	/** One sentence for the person importing. */
	message: string;
	/** The file the issue is about, relative to the skill folder. */
	path?: string;
};

/** A path segment that is never installed: version control, dependencies, OS litter. */
const STRIPPED_SEGMENTS = new Set([".git", "node_modules", ".DS_Store", "__MACOSX"]);

/** True for a path the import drops silently and lists as removed. */
export const isStrippedPath = (path: string): boolean =>
	path.split("/").some((segment) => STRIPPED_SEGMENTS.has(segment) || segment.startsWith("._"));

/**
 * Why a relative path cannot be written inside a folder, or undefined when it
 * can. Uploaded names are untrusted: a `..` segment, a leading slash or a drive
 * letter is how an archive escapes the folder it is unpacked into.
 */
export const skillPathProblem = (path: string): string | undefined => {
	if (path === "") return "A file has no name";
	if (path.includes("\0")) return `${JSON.stringify(path)} contains a null byte`;
	if (path.includes("\\")) return `${path} uses a backslash; use / between folders`;
	if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return `${path} is an absolute path`;
	const segments = path.split("/");
	if (segments.includes("..")) return `${path} climbs out of its folder with ..`;
	if (segments.includes("") || segments.includes("."))
		return `${path} is not a clean relative path`;
	return undefined;
};

/** One file in a bundle, as the limits see it. */
export type BundleFile = { path: string; size: number };

/** The limits one skill folder must stay within. */
export const skillLimitIssues = (files: readonly BundleFile[]): SkillIssue[] => {
	const issues: SkillIssue[] = [];
	if (files.length > IMPORT_MAX_FILES) {
		issues.push({
			code: "too-many-files",
			message: `The skill has ${files.length} files; the limit is ${IMPORT_MAX_FILES}`,
		});
	}
	const bytes = files.reduce((sum, file) => sum + file.size, 0);
	if (bytes > IMPORT_MAX_SKILL_BYTES) {
		issues.push({
			code: "too-large",
			message: `The skill unpacks to ${Math.ceil(bytes / 1024 / 1024)} MB; the limit is ${IMPORT_MAX_SKILL_BYTES / 1024 / 1024} MB`,
		});
	}
	return issues;
};

/** The path issues of every file in an upload, so the browser can refuse early. */
export const uploadPathIssues = (paths: readonly string[]): SkillIssue[] =>
	paths.flatMap((path) => {
		const problem = skillPathProblem(path);
		return problem === undefined ? [] : [{ code: "unsafe-path", message: problem, path }];
	});

/**
 * The files named like `SKILL.md` in a skill folder's root that are not exactly
 * that. pi matches the exact name, so `skill.md` loads nothing.
 */
export const misnamedSkillFiles = (rootFileNames: readonly string[]): string[] =>
	rootFileNames.filter((name) => name.toLowerCase() === "skill.md" && name !== "SKILL.md");
